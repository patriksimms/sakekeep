import * as m from "#/paraglide/messages.js"
import { createPreflightReport, hasFailedPreflight, reportAsText } from "../domain/preflight"
import { blockingProblems } from "../domain/generation"
import { pageSpecification } from "../domain/page-format.ts"
import { type ExportArtifact } from "../domain/types"
import { HttpError } from "./http"
import { putObject, putObjectStream } from "./object-store"
import { pageJpegs } from "./page-raster"
import { bookPagePdfs, inspectPdf, renderBookPdf } from "./pdf-renderer"
import { getProject, recordExport, reserveObjects } from "./repository"
import { pageEntryName, zipEntries, type ZipEntry } from "./zip"

/** Names each produced page in book order without collecting the pages first. */
async function* bundleEntries(
  pages: AsyncIterable<Uint8Array>,
  pageCount: number,
  extension: string
): AsyncGenerator<ZipEntry> {
  let index = 0
  for await (const data of pages) {
    yield { name: pageEntryName(index, pageCount, extension), data }
    index += 1
  }
}

export interface ExportOptions {
  marks: boolean
  allowBlockingProblems: boolean
  reviewedBookFingerprint: string | null
}

/**
 * One line per export attempt. Exports are the slowest thing the server does and the only
 * operation that can outlive the request that asked for it, so duration, size and outcome have
 * to be visible without a reproduction — including for an export the organizer never saw finish.
 */
function logExport(fields: {
  projectId: string
  pageCount: number
  durationMs: number
  outcome: "completed" | "rejected" | "failed"
  clientDisconnected: boolean
}): void {
  console.log(`[export] ${JSON.stringify(fields)}`)
}

export async function exportProject(
  projectId: string,
  options: ExportOptions,
  /** The request's signal, so a completion after the organizer gave up is recorded as such. */
  signal?: AbortSignal
): Promise<ExportArtifact> {
  const started = performance.now()
  const progress = { pageCount: 0 }
  const record = (outcome: "completed" | "rejected" | "failed") =>
    logExport({
      projectId,
      pageCount: progress.pageCount,
      durationMs: Math.round(performance.now() - started),
      outcome,
      clientDisconnected: signal?.aborted ?? false,
    })
  try {
    const artifact = await runExport(projectId, options, progress)
    record("completed")
    return artifact
  } catch (error) {
    // A refused export is a normal answer to a book that is not ready; only the rest is a fault.
    record(error instanceof HttpError ? "rejected" : "failed")
    throw error
  }
}

async function runExport(
  projectId: string,
  options: ExportOptions,
  progress: { pageCount: number }
): Promise<ExportArtifact> {
  const project = await getProject(projectId, true)
  if (project.archivedAt) {
    throw new HttpError(409, m.ui_this_project_is_archived_unarchive_it_before_making_changes())
  }
  if (!project.book || project.bookStatus === "not-generated") {
    throw new HttpError(409, m.ui_generate_the_complete_book_before_exporting())
  }
  if (project.bookStatus === "stale") {
    throw new HttpError(
      409,
      m.ui_this_preview_is_stale_regenerate_the_complete_book_before_exporti()
    )
  }
  if (
    options.allowBlockingProblems &&
    options.reviewedBookFingerprint !== project.book.sourceFingerprint
  ) {
    throw new HttpError(
      409,
      m.ui_the_book_changed_after_you_accepted_its_problems_review_it_again_()
    )
  }
  const problems = blockingProblems(project.book)
  if (problems.length > 0 && !options.allowBlockingProblems) {
    throw new HttpError(409, m.resolve_blocking_problems({ value0: problems.length }), { problems })
  }

  progress.pageCount = project.book.pages.length
  const specification = pageSpecification(project.pageFormat, project.pageOrientation)
  const renderInput = {
    locale: project.bookLanguage,
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
    assetResolutions: inspection.assetResolutions,
    marks: options.marks,
    allowBlockingProblems: options.allowBlockingProblems,
    pageSpecification: specification,
  })
  if (hasFailedPreflight(report)) {
    throw new HttpError(409, m.ui_automated_preflight_failed_no_final_export_was_stored(), {
      report,
    })
  }

  const id = crypto.randomUUID()
  const baseKey = `projects/${projectId}/exports/${id}`
  const pdfObjectKey = `${baseKey}/sakekeep-${project.pageFormat}-${project.pageOrientation}.pdf`
  const reportObjectKey = `${baseKey}/preflight-report.txt`
  const pagePdfZipObjectKey = `${baseKey}/sakekeep-pages-pdf.zip`
  const pageJpegZipObjectKey = `${baseKey}/sakekeep-pages-jpeg.zip`
  // Nothing discovers a stored object except the export row, so claim the keys as
  // removable first. Whatever fails between here and `recordExport` — an upload, the
  // insert, the process itself — leaves the files for the orphan sweep instead of
  // stranding them in the bucket forever.
  await reserveObjects([pdfObjectKey, reportObjectKey, pagePdfZipObjectKey, pageJpegZipObjectKey])
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

  // Every export carries the same set of files, so the organizer picks a format when
  // downloading instead of predicting it before the render. Bundles are built after
  // preflight passed, so a rejected export never spends time on them. Each one is
  // rendered, zipped, and uploaded in a single pass, one page at a time, so a long book
  // never puts its pages and its archive on the heap together.
  const pageCount = progress.pageCount
  await putObjectStream({
    key: pagePdfZipObjectKey,
    body: zipEntries(
      bundleEntries(
        bookPagePdfs(
          pdf,
          project.book.pages.map((page) => page.id)
        ),
        pageCount,
        "pdf"
      )
    ),
    contentType: "application/zip",
  })
  await putObjectStream({
    key: pageJpegZipObjectKey,
    body: zipEntries(bundleEntries(pageJpegs(pdf), pageCount, "jpg")),
    contentType: "application/zip",
  })

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
    pagePdfZipUrl: `/api/exports/${exportId}?file=page-pdfs`,
    pageJpegZipUrl: `/api/exports/${exportId}?file=page-jpegs`,
    report,
  }
}
