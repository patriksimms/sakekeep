import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { BACKGROUND_PRESET_IDS } from "#/domain/layout-backgrounds.ts"
import { LAYOUT_ROLES } from "#/domain/layout-roles.ts"
import { PAGE_FORMATS, PAGE_ORIENTATIONS } from "#/domain/page-format.ts"
import { jsonError, readJson } from "#/server/http.ts"
import {
  createLayout,
  duplicateLayout,
  reorderLayouts,
  setProjectPageFormat,
} from "#/server/repository.ts"

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().max(200).optional(),
    backgroundPresetId: z.enum(BACKGROUND_PRESET_IDS).optional(),
    role: z.enum(LAYOUT_ROLES).optional(),
  }),
  z.object({
    action: z.literal("set-page-format"),
    pageFormat: z.enum(PAGE_FORMATS),
    pageOrientation: z.enum(PAGE_ORIENTATIONS),
    resetLayouts: z.boolean().optional(),
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
              await createLayout(
                params.projectId,
                input.name,
                input.backgroundPresetId,
                input.role
              ),
              { status: 201 }
            )
          }
          if (input.action === "duplicate") {
            return Response.json(await duplicateLayout(params.projectId, input.layoutId), {
              status: 201,
            })
          }
          if (input.action === "set-page-format") {
            return Response.json(
              await setProjectPageFormat({ projectId: params.projectId, ...input })
            )
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
