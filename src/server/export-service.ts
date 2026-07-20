import { createPreflightReport, hasFailedPreflight, reportAsText } from "../domain/preflight"
import { blockingProblems } from "../domain/generation"
import { type ExportArtifact } from "../domain/types"
import { HttpError } from "./http"
import { putObject } from "./object-store"
import { inspectPdf, renderBookPdf } from "./pdf-renderer"
import { getProject, recordExport } from "./repository"

export async function exportProject(projectId: string, marks: boolean): Promise<ExportArtifact> {
  const project = await getProject(projectId, true)
  if (!project.book || project.bookStatus === "not-generated") {
    throw new HttpError(409, "Generate the complete book before exporting.")
  }
  if (project.bookStatus === "stale") {
    throw new HttpError(
      409,
      "This preview is stale. Regenerate the complete book before exporting."
    )
  }
  const problems = blockingProblems(project.book)
  if (problems.length > 0) {
    throw new HttpError(
      409,
      `Resolve ${problems.length} blocking page problem(s) before exporting.`,
      { problems }
    )
  }

  const pdf = await renderBookPdf({
    book: project.book,
    layouts: project.layouts,
    submissions: project.submissions ?? [],
    form: project.formSchema,
    marks,
  })
  const inspection = await inspectPdf(pdf)
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
    marks,
  })
  if (hasFailedPreflight(report)) {
    throw new HttpError(409, "Automated preflight failed. No final export was stored.", { report })
  }

  const id = crypto.randomUUID()
  const baseKey = `projects/${projectId}/exports/${id}`
  const pdfObjectKey = `${baseKey}/sakekeep-a5-landscape.pdf`
  const reportObjectKey = `${baseKey}/preflight-report.txt`
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
  const exportId = await recordExport({
    projectId,
    sourceFingerprint: project.book.sourceFingerprint,
    pdfObjectKey,
    reportObjectKey,
    report,
  })
  return {
    id: exportId,
    pdfUrl: `/api/exports/${exportId}?file=pdf`,
    reportUrl: `/api/exports/${exportId}?file=report`,
    report,
  }
}
