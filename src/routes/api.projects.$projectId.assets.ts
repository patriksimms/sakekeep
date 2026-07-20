import { createFileRoute } from "@tanstack/react-router"

import { uploadDecorativeAsset } from "#/server/decorative-asset-service.ts"
import { jsonError } from "#/server/http.ts"

export const Route = createFileRoute("/api/projects/$projectId/assets")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        try {
          return Response.json(await uploadDecorativeAsset(params.projectId, request), {
            status: 201,
          })
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
