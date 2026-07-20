import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { exportProject } from "#/server/export-service.ts"
import { jsonError, readJson } from "#/server/http.ts"

const exportSchema = z.object({ marks: z.boolean().default(false) })

export const Route = createFileRoute("/api/projects/$projectId/export")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        try {
          const input = exportSchema.parse(await readJson(request))
          return Response.json(await exportProject(params.projectId, input.marks), { status: 201 })
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
