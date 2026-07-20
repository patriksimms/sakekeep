import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { jsonError, readJson } from "#/server/http.ts"
import { createProject, listProjects } from "#/server/repository.ts"

const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(200),
  occasion: z.string().trim().max(200).nullable().optional(),
})

export const Route = createFileRoute("/api/projects")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return Response.json({ projects: await listProjects() })
        } catch (error) {
          return jsonError(error)
        }
      },
      POST: async ({ request }) => {
        try {
          const input = createProjectSchema.parse(await readJson(request))
          return Response.json(await createProject(input), { status: 201 })
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
