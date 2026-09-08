import * as m from "#/paraglide/messages.js"
import { createFileRoute } from "@tanstack/react-router"
import { clerkClient } from "@clerk/tanstack-react-start/server"
import { z } from "zod"
import { jsonError, readJson, HttpError } from "#/server/http"
import { currentUserId, verifiedAccountEmails } from "#/server/organizer"
import {
  getProjectAccess,
  inviteCollaborator,
  changeCollaborator,
  revokeInvitation,
  transferOwnership,
  collaboratorRoleSchema,
  invitationEmailSchema,
} from "#/server/project-access"
import { isDemoMode } from "#/lib/demo-mode"
import { env } from "#/server/env"

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("invite"),
    email: invitationEmailSchema,
    role: collaboratorRoleSchema,
  }),
  z.object({ action: z.literal("link") }),
  z.object({
    action: z.literal("change"),
    userId: z.string().min(1),
    role: collaboratorRoleSchema.nullable(),
  }),
  z.object({ action: z.literal("revoke"), invitationId: z.uuid() }),
  z.object({ action: z.literal("transfer"), userId: z.string().min(1) }),
])

export const Route = createFileRoute("/api/projects/$projectId/collaborators")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          if (isDemoMode)
            return Response.json({
              role: "owner",
              ownerUserId: "demo-organizer",
              members: [],
              invitations: [],
            })
          return Response.json(await getProjectAccess(params.projectId, await currentUserId()))
        } catch (error) {
          return jsonError(error)
        }
      },
      POST: async ({ params, request }) => {
        try {
          const input = actionSchema.parse(await readJson(request))
          const userId = await currentUserId()
          if (isDemoMode) throw new HttpError(403, m.access_error_12())
          switch (input.action) {
            case "invite":
              await inviteCollaborator(
                params.projectId,
                userId,
                input.email,
                input.role,
                async (emailAddress, token) => {
                  await clerkClient().invitations.createInvitation({
                    emailAddress,
                    ignoreExisting: true,
                    expiresInDays: 7,
                    redirectUrl: `${env().APP_ORIGIN}/invitations/${token}`,
                  })
                }
              )
              break
            case "link": {
              const { token } = await inviteCollaborator(params.projectId, userId, null, "editor")
              return Response.json(
                { url: `${env().APP_ORIGIN}/invitations/${token}` },
                { headers: { "Cache-Control": "no-store" } }
              )
            }
            case "change":
              await changeCollaborator(params.projectId, userId, input.userId, input.role)
              break
            case "revoke":
              await revokeInvitation(params.projectId, userId, input.invitationId)
              break
            case "transfer": {
              const emails = await verifiedAccountEmails(userId)
              if (!emails[0]) throw new HttpError(403, m.access_error_13())
              await transferOwnership(params.projectId, userId, input.userId, emails[0])
              break
            }
          }
          return new Response(null, { status: 204 })
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
