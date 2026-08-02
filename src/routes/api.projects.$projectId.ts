import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { draftFormSchemaValidator } from "#/domain/form.ts"
import { jsonError, readJson } from "#/server/http.ts"
import { deleteProject, getProject, updateProject } from "#/server/repository.ts"

// PATCH is the builder's autosave, so it must accept a form that is still being written.
// `publishProject` is what holds the line on completeness.
const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  occasion: z.string().trim().max(200).nullable().optional(),
  formSchema: draftFormSchemaValidator.optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
})

export const Route = createFileRoute("/api/projects/$projectId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try {
          const url = new URL(request.url)
          return Response.json(
            await getProject(params.projectId, url.searchParams.get("submissions") === "true")
          )
        } catch (error) {
          return jsonError(error)
        }
      },
      PATCH: async ({ params, request }) => {
        try {
          const input = updateSchema.parse(await readJson(request))
          return Response.json(await updateProject({ projectId: params.projectId, ...input }))
        } catch (error) {
          return jsonError(error)
        }
      },
      DELETE: async ({ params }) => {
        try {
          await deleteProject(params.projectId)
          return new Response(null, { status: 204 })
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
