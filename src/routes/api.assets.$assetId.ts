import { createFileRoute } from "@tanstack/react-router"

import { jsonError } from "#/server/http.ts"
import { getObject } from "#/server/object-store.ts"
import { getAsset } from "#/server/repository.ts"

export const Route = createFileRoute("/api/assets/$assetId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try {
          const asset = await getAsset(params.assetId)
          const variant = new URL(request.url).searchParams.get("variant")
          const stored = await getObject(
            variant === "preview" ? asset.previewObjectKey : asset.objectKey
          )
          const body = stored.body.buffer.slice(
            stored.body.byteOffset,
            stored.body.byteOffset + stored.body.byteLength
          ) as ArrayBuffer
          return new Response(body, {
            headers: {
              "Content-Type": stored.contentType,
              "Cache-Control": "private, max-age=31536000, immutable",
              "X-Content-Type-Options": "nosniff",
            },
          })
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
