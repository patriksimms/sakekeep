import * as m from "#/paraglide/messages.js"
import { createFileRoute } from "@tanstack/react-router"

import { jsonError } from "#/server/http.ts"
import { findPublicProject } from "#/server/repository.ts"
import { isWellFormedShareToken } from "#/server/share-token.ts"
import { submitContribution } from "#/server/submission-service.ts"

export const Route = createFileRoute("/api/share/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          if (!isWellFormedShareToken(params.token)) {
            return Response.json(
              {
                status: "unknown",
                message: m.ui_this_share_link_is_unknown_or_malformed(),
              },
              { status: 404 }
            )
          }
          const result = await findPublicProject(params.token)
          if (result.status === "unknown") {
            return Response.json(
              {
                status: "unknown",
                message: m.ui_this_share_link_is_unknown_or_malformed(),
              },
              { status: 404 }
            )
          }
          if (result.status === "closed") {
            return Response.json({
              status: "closed",
              bookLanguage: result.bookLanguage,
              message: m.ui_this_collection_is_permanently_closed(
                {},
                { locale: result.bookLanguage }
              ),
            })
          }
          return Response.json({
            status: "collecting",
            title: result.title,
            bookLanguage: result.bookLanguage,
            formSchema: result.formSchema,
          })
        } catch (error) {
          return jsonError(error)
        }
      },
      POST: async ({ params, request }) => {
        try {
          if (!isWellFormedShareToken(params.token)) {
            return Response.json(
              { error: m.ui_this_share_link_is_unknown_or_malformed() },
              { status: 404 }
            )
          }
          const publicProject = await findPublicProject(params.token)
          const locale = publicProject.status === "unknown" ? "de" : publicProject.bookLanguage
          const result = await submitContribution(params.token, request)
          return Response.json(
            {
              ...result,
              message: result.created
                ? m.ui_your_response_was_submitted({}, { locale })
                : m.ui_this_response_was_already_submitted({}, { locale }),
            },
            { status: result.created ? 201 : 200 }
          )
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
