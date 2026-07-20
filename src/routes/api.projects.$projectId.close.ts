import { createFileRoute } from "@tanstack/react-router"

import { jsonError } from "#/server/http.ts"
import { closeProject } from "#/server/repository.ts"

export const Route = createFileRoute("/api/projects/$projectId/close")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        try {
          return Response.json(await closeProject(params.projectId))
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
