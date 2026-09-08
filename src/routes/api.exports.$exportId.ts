import * as m from "#/paraglide/messages.js"
import { createFileRoute } from "@tanstack/react-router"

import { HttpError, jsonError } from "#/server/http.ts"
import { getObject } from "#/server/object-store.ts"
import { getExport } from "#/server/repository.ts"

type ExportRecord = Awaited<ReturnType<typeof getExport>>

function requestedFile(
  record: ExportRecord,
  file: string | null,
  pdfName: string
): { objectKey: string; downloadName: string } {
  if (file === "report") {
    return { objectKey: record.reportObjectKey, downloadName: "sakekeep-preflight.txt" }
  }
  if (file === "page-pdfs" || file === "page-jpegs") {
    const isPdfBundle = file === "page-pdfs"
    const objectKey = isPdfBundle ? record.pagePdfZipObjectKey : record.pageJpegZipObjectKey
    if (!objectKey) {
      throw new HttpError(404, m.ui_this_export_was_created_without_that_page_bundle())
    }
    return {
      objectKey,
      downloadName: isPdfBundle ? "sakekeep-pages-pdf.zip" : "sakekeep-pages-jpeg.zip",
    }
  }
  return { objectKey: record.pdfObjectKey, downloadName: `sakekeep-${pdfName}.pdf` }
}

export const Route = createFileRoute("/api/exports/$exportId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try {
          const record = await getExport(params.exportId)
          const pdfName = record.report.specification.standard
            .replace("DIN/ISO ", "")
            .toLowerCase()
            .replace(" ", "-")
          const requested = requestedFile(
            record,
            new URL(request.url).searchParams.get("file"),
            pdfName
          )
          const stored = await getObject(requested.objectKey)
          const body = stored.body.buffer.slice(
            stored.body.byteOffset,
            stored.body.byteOffset + stored.body.byteLength
          ) as ArrayBuffer
          return new Response(body, {
            headers: {
              "Content-Type": stored.contentType,
              "Content-Disposition": `attachment; filename="${requested.downloadName}"`,
              "Cache-Control": "private, no-store",
            },
          })
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
