import { createFileRoute } from "@tanstack/react-router"

import { jsonError } from "#/server/http.ts"
import { publishProject } from "#/server/repository.ts"

export const Route = createFileRoute("/api/projects/$projectId/publish")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        try {
          return Response.json(await publishProject(params.projectId))
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
