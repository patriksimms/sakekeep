import * as m from "#/paraglide/messages.js"
import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { jsonError, readJson } from "#/server/http.ts"
import { currentOrganizer } from "#/server/organizer.ts"
import { updateSubmissionTextAnswers } from "#/server/repository.ts"

const updateSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  answers: z
    .record(z.string().min(1).max(100), z.string())
    .refine(
      (answers) => Object.keys(answers).length > 0,
      m.ui_change_at_least_one_text_answer_469()
    ),
})

export const Route = createFileRoute("/api/projects/$projectId/submissions/$submissionId")({
  server: {
    handlers: {
      PATCH: async ({ params, request }) => {
        try {
          const input = updateSchema.parse(await readJson(request))
          return Response.json(
            await updateSubmissionTextAnswers({
              projectId: params.projectId,
              submissionId: params.submissionId,
              editor: await currentOrganizer(),
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
