import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { jsonError } from "#/server/http"
import { currentUserId, verifiedAccountEmails } from "#/server/organizer"
import { acceptInvitation, previewInvitation } from "#/server/project-access"

export const Route = createFileRoute("/api/invitations/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          await currentUserId()
          const token = z
            .string()
            .regex(/^[A-Za-z0-9_-]{43}$/)
            .parse(params.token)
          return Response.json(await previewInvitation(token), {
            headers: { "Cache-Control": "no-store" },
          })
        } catch (error) {
          return jsonError(error)
        }
      },
      POST: async ({ params }) => {
        try {
          const token = z
            .string()
            .regex(/^[A-Za-z0-9_-]{43}$/)
            .parse(params.token)
          const userId = await currentUserId()
          return Response.json(
            await acceptInvitation(token, userId, await verifiedAccountEmails(userId))
          )
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
