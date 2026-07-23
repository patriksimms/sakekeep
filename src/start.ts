import { clerkMiddleware } from "@clerk/tanstack-react-start/server"
import { createStart } from "@tanstack/react-start"

import { isDemoMode } from "#/lib/demo-mode.ts"

export const startInstance = createStart(() => {
  return {
    requestMiddleware: isDemoMode ? [] : [clerkMiddleware()],
  }
})
