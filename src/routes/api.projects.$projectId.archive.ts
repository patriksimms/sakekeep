import { createFileRoute } from "@tanstack/react-router"

import { jsonError } from "#/server/http.ts"
import { archiveProject } from "#/server/repository.ts"

export const Route = createFileRoute("/api/projects/$projectId/archive")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        try {
          return Response.json(await archiveProject(params.projectId))
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
