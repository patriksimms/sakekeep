import { createFileRoute } from "@tanstack/react-router"

import { jsonError } from "#/server/http.ts"
import { getObject } from "#/server/object-store.ts"
import { getExport } from "#/server/repository.ts"

export const Route = createFileRoute("/api/exports/$exportId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try {
          const record = await getExport(params.exportId)
          const file = new URL(request.url).searchParams.get("file")
          const isReport = file === "report"
          const stored = await getObject(isReport ? record.reportObjectKey : record.pdfObjectKey)
          const body = stored.body.buffer.slice(
            stored.body.byteOffset,
            stored.body.byteOffset + stored.body.byteLength
          ) as ArrayBuffer
          return new Response(body, {
            headers: {
              "Content-Type": stored.contentType,
              "Content-Disposition": `attachment; filename="${isReport ? "sakekeep-preflight.txt" : "sakekeep-a5-landscape.pdf"}"`,
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
