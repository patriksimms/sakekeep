import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { BACKGROUND_PRESET_IDS } from "#/domain/layout-backgrounds.ts"
import { jsonError, readJson } from "#/server/http.ts"
import { createLayout, duplicateLayout, reorderLayouts } from "#/server/repository.ts"

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().max(200).optional(),
    backgroundPresetId: z.enum(BACKGROUND_PRESET_IDS).optional(),
  }),
  z.object({
    action: z.literal("duplicate"),
    layoutId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("reorder"),
    layoutIds: z.array(z.string().uuid()),
  }),
])

export const Route = createFileRoute("/api/projects/$projectId/layouts")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        try {
          const input = actionSchema.parse(await readJson(request))
          if (input.action === "create") {
            return Response.json(
              await createLayout(params.projectId, input.name, input.backgroundPresetId),
              { status: 201 }
            )
          }
          if (input.action === "duplicate") {
            return Response.json(await duplicateLayout(params.projectId, input.layoutId), {
              status: 201,
            })
          }
          return Response.json({
            layouts: await reorderLayouts(params.projectId, input.layoutIds),
          })
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
