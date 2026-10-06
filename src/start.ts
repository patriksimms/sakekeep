import { clerkMiddleware } from "@clerk/tanstack-react-start/server"
import { paraglideMiddleware } from "#/paraglide/server.js"
import { createMiddleware } from "@tanstack/react-start"
import { createStart } from "@tanstack/react-start"

import { isDemoMode } from "#/lib/demo-mode.ts"
import { projectAuthorizationMiddleware } from "#/server/project-authorization.ts"
import { authorizationMiddleware } from "#/server/auth-policy.ts"

// Production auth configuration is validated in server.ts; this module is bundled for the
// browser too, where `process.env` compiles to `{}` and any check here always fails.

const requestLoggingMiddleware = createMiddleware({ type: "request" }).server(
  async ({ request, next }) => {
    const { logRequest } = await import("#/server/request-logging.ts")
    return logRequest(request, next)
  }
)

const localeMiddleware = createMiddleware().server(({ request, next }) =>
  paraglideMiddleware(request, () => next())
)

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [
      requestLoggingMiddleware,
      localeMiddleware,
      ...(isDemoMode
        ? []
        : [clerkMiddleware(), authorizationMiddleware, projectAuthorizationMiddleware]),
    ],
  }
})
