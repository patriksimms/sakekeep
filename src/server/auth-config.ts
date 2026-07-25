export type AuthEnvironment = Record<string, string | undefined>

export function validateProductionAuthConfiguration(environment: AuthEnvironment) {
  if (environment.VITE_SAKEKEEP_DEMO_MODE === "true") {
    throw new Error(
      "Production authentication configuration rejected: VITE_SAKEKEEP_DEMO_MODE=true"
    )
  }

  const missing = ["VITE_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"].filter(
    (name) => !environment[name]?.trim()
  )
  if (missing.length > 0) {
    throw new Error(`Missing required production Clerk configuration: ${missing.join(", ")}`)
  }
}
