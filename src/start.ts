import { clerkMiddleware } from "@clerk/tanstack-react-start/server"
import { createStart } from "@tanstack/react-start"

import { isDemoMode } from "#/lib/demo-mode.ts"
import { validateProductionAuthConfiguration } from "#/server/auth-config.ts"
import { authorizationMiddleware } from "#/server/auth-policy.ts"

if (process.env.NODE_ENV === "production") {
  validateProductionAuthConfiguration(process.env)
}

export const startInstance = createStart(() => {
  return {
    requestMiddleware: isDemoMode ? [] : [clerkMiddleware(), authorizationMiddleware],
  }
})
