import { createFileRoute } from "@tanstack/react-router"

import { jsonError } from "#/server/http.ts"
import { duplicateProject } from "#/server/repository.ts"

export const Route = createFileRoute("/api/projects/$projectId/duplicate")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        try {
          return Response.json(await duplicateProject(params.projectId), {
            status: 201,
          })
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
