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
                message: "This share link is unknown or malformed.",
              },
              { status: 404 }
            )
          }
          const result = await findPublicProject(params.token)
          if (result.status === "unknown") {
            return Response.json(
              {
                status: "unknown",
                message: "This share link is unknown or malformed.",
              },
              { status: 404 }
            )
          }
          if (result.status === "closed") {
            return Response.json({
              status: "closed",
              message: "This collection is permanently closed.",
            })
          }
          return Response.json({
            status: "collecting",
            title: result.title,
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
              { error: "This share link is unknown or malformed." },
              { status: 404 }
            )
          }
          const result = await submitContribution(params.token, request)
          return Response.json(
            {
              ...result,
              message: result.created
                ? "Your response was submitted."
                : "This response was already submitted.",
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
