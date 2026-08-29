import { createPreflightReport, hasFailedPreflight, reportAsText } from "../domain/preflight"
import { blockingProblems } from "../domain/generation"
import { pageSpecification } from "../domain/page-format.ts"
import { type ExportArtifact } from "../domain/types"
import { HttpError } from "./http"
import { putObject } from "./object-store"
import { renderPageJpegs } from "./page-raster"
import { inspectPdf, renderBookPagePdfs, renderBookPdf } from "./pdf-renderer"
import { getProject, recordExport } from "./repository"
import { createZip, pageEntryName } from "./zip"

export async function exportProject(
  projectId: string,
  options: {
    marks: boolean
    allowBlockingProblems: boolean
    reviewedBookFingerprint: string | null
    pagePdfs: boolean
    pageJpegs: boolean
  }
): Promise<ExportArtifact> {
  const project = await getProject(projectId, true)
  if (project.archivedAt) {
    throw new HttpError(409, "This project is archived. Unarchive it before making changes.")
  }
  if (!project.book || project.bookStatus === "not-generated") {
    throw new HttpError(409, "Generate the complete book before exporting.")
  }
  if (project.bookStatus === "stale") {
    throw new HttpError(
      409,
      "This preview is stale. Regenerate the complete book before exporting."
    )
  }
  if (
    options.allowBlockingProblems &&
    options.reviewedBookFingerprint !== project.book.sourceFingerprint
  ) {
    throw new HttpError(
      409,
      "The book changed after you accepted its problems. Review it again before exporting."
    )
  }
  const problems = blockingProblems(project.book)
  if (problems.length > 0 && !options.allowBlockingProblems) {
    throw new HttpError(
      409,
      `Resolve ${problems.length} blocking page problem(s) before exporting.`,
      { problems }
    )
  }

  const specification = pageSpecification(project.pageFormat, project.pageOrientation)
  const renderInput = {
    book: project.book,
    layouts: project.layouts,
    submissions: project.submissions ?? [],
    form: project.formSchema,
    marks: options.marks,
    pageFormat: project.pageFormat,
    pageOrientation: project.pageOrientation,
  }
  const pdf = await renderBookPdf(renderInput)
  const inspection = await inspectPdf(pdf, specification)
  const report = createPreflightReport({
    projectId,
    book: project.book,
    bookStatus: project.bookStatus,
    pageCount: inspection.pageCount,
    fontsEmbedded: inspection.fontsEmbedded,
    outputIntentEmbedded: inspection.outputIntentEmbedded && inspection.pdfxMetadata,
    pageBoxesValid: inspection.pageBoxesValid,
    assetResolutionMetadata: inspection.assetResolutionMetadata,
    assetResolutionCount: inspection.assetResolutionCount,
    marks: options.marks,
    allowBlockingProblems: options.allowBlockingProblems,
    pageSpecification: specification,
  })
  if (hasFailedPreflight(report)) {
    throw new HttpError(409, "Automated preflight failed. No final export was stored.", { report })
  }

  // Bundles are built only after preflight passed, so a rejected export never spends
  // time rendering per-page files or rasterizing them.
  const pageCount = project.book.pages.length
  const pagePdfZip = options.pagePdfs
    ? createZip(
        (await renderBookPagePdfs(renderInput)).map((page, index) => ({
          name: pageEntryName(index, pageCount, "pdf"),
          data: page,
        }))
      )
    : null
  const pageJpegZip = options.pageJpegs
    ? createZip(
        (await renderPageJpegs(pdf)).map((image, index) => ({
          name: pageEntryName(index, pageCount, "jpg"),
          data: image,
        }))
      )
    : null

  const id = crypto.randomUUID()
  const baseKey = `projects/${projectId}/exports/${id}`
  const pdfObjectKey = `${baseKey}/sakekeep-${project.pageFormat}-${project.pageOrientation}.pdf`
  const reportObjectKey = `${baseKey}/preflight-report.txt`
  const pagePdfZipObjectKey = pagePdfZip ? `${baseKey}/sakekeep-pages-pdf.zip` : null
  const pageJpegZipObjectKey = pageJpegZip ? `${baseKey}/sakekeep-pages-jpeg.zip` : null
  await putObject({
    key: pdfObjectKey,
    body: pdf,
    contentType: "application/pdf",
  })
  await putObject({
    key: reportObjectKey,
    body: Buffer.from(reportAsText(report), "utf8"),
    contentType: "text/plain; charset=utf-8",
  })
  if (pagePdfZip && pagePdfZipObjectKey) {
    await putObject({
      key: pagePdfZipObjectKey,
      body: pagePdfZip,
      contentType: "application/zip",
    })
  }
  if (pageJpegZip && pageJpegZipObjectKey) {
    await putObject({
      key: pageJpegZipObjectKey,
      body: pageJpegZip,
      contentType: "application/zip",
    })
  }
  const exportId = await recordExport({
    projectId,
    sourceFingerprint: project.book.sourceFingerprint,
    pdfObjectKey,
    reportObjectKey,
    pagePdfZipObjectKey,
    pageJpegZipObjectKey,
    report,
  })
  return {
    id: exportId,
    pdfUrl: `/api/exports/${exportId}?file=pdf`,
    reportUrl: `/api/exports/${exportId}?file=report`,
    pagePdfZipUrl: pagePdfZipObjectKey ? `/api/exports/${exportId}?file=page-pdfs` : null,
    pageJpegZipUrl: pageJpegZipObjectKey ? `/api/exports/${exportId}?file=page-jpegs` : null,
    report,
  }
}
