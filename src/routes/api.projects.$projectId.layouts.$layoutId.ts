import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { layoutSchemaValidator } from "#/domain/layout.ts"
import { jsonError, readJson } from "#/server/http.ts"
import { deleteLayout, updateLayout } from "#/server/repository.ts"

const updateSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  name: z.string().max(200).optional(),
  schema: layoutSchemaValidator.optional(),
})

export const Route = createFileRoute("/api/projects/$projectId/layouts/$layoutId")({
  server: {
    handlers: {
      PATCH: async ({ params, request }) => {
        try {
          const input = updateSchema.parse(await readJson(request))
          return Response.json(
            await updateLayout({
              projectId: params.projectId,
              layoutId: params.layoutId,
              ...input,
            })
          )
        } catch (error) {
          return jsonError(error)
        }
      },
      DELETE: async ({ params }) => {
        try {
          await deleteLayout(params.projectId, params.layoutId)
          return new Response(null, { status: 204 })
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
