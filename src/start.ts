import { clerkMiddleware } from "@clerk/tanstack-react-start/server"
import { createStart } from "@tanstack/react-start"

import { isDemoMode } from "#/lib/demo-mode.ts"
import { authorizationMiddleware } from "#/server/auth-policy.ts"

// Production auth configuration is validated in server.ts; this module is bundled for the
// browser too, where `process.env` compiles to `{}` and any check here always fails.

export const startInstance = createStart(() => {
  return {
    requestMiddleware: isDemoMode ? [] : [clerkMiddleware(), authorizationMiddleware],
  }
})
