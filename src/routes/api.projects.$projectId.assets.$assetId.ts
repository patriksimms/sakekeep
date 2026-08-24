import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { jsonError, readJson } from "#/server/http.ts"
import { setAssetFocalPoint } from "#/server/repository.ts"

const updateSchema = z.object({
  focalPoint: z
    .object({
      x: z.number().finite().min(0).max(1),
      y: z.number().finite().min(0).max(1),
    })
    .nullable(),
})

export const Route = createFileRoute("/api/projects/$projectId/assets/$assetId")({
  server: {
    handlers: {
      PATCH: async ({ params, request }) => {
        try {
          const { focalPoint } = updateSchema.parse(await readJson(request))
          await setAssetFocalPoint({
            projectId: params.projectId,
            assetId: params.assetId,
            focalPoint,
          })
          return new Response(null, { status: 204 })
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
