import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { bookPageValidator, generationSettingsValidator } from "#/domain/book.ts"
import { jsonError, readJson } from "#/server/http.ts"
import { generateProjectBook, updateProjectBook } from "#/server/repository.ts"

const updateSchema = z.object({
  pages: z.array(bookPageValidator).optional(),
  settings: generationSettingsValidator.optional(),
})

export const Route = createFileRoute("/api/projects/$projectId/book")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        try {
          const settings = generationSettingsValidator.parse(await readJson(request))
          return Response.json(await generateProjectBook(params.projectId, settings))
        } catch (error) {
          return jsonError(error)
        }
      },
      PATCH: async ({ params, request }) => {
        try {
          const input = updateSchema.parse(await readJson(request))
          return Response.json(
            await updateProjectBook({
              projectId: params.projectId,
              ...input,
            })
          )
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
