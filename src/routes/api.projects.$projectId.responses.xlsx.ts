import { createFileRoute } from "@tanstack/react-router"

import { jsonError } from "#/server/http.ts"
import { getProject } from "#/server/repository.ts"
import { responseWorkbook } from "#/server/response-export.ts"

export const Route = createFileRoute("/api/projects/$projectId/responses/xlsx")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try {
          const project = await getProject(params.projectId, true)
          const workbook = await responseWorkbook(project, new URL(request.url).origin)
          return new Response(new Uint8Array(workbook), {
            headers: {
              "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "Content-Disposition": `attachment; filename="responses-${project.id}.xlsx"`,
              "Cache-Control": "no-store",
            },
          })
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
