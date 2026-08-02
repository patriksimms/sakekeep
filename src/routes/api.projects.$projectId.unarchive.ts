import { createFileRoute } from "@tanstack/react-router"

import { jsonError } from "#/server/http.ts"
import { unarchiveProject } from "#/server/repository.ts"

export const Route = createFileRoute("/api/projects/$projectId/unarchive")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        try {
          return Response.json(await unarchiveProject(params.projectId))
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
