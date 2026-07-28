export type AuthEnvironment = Record<string, string | undefined>

export function validateProductionAuthBuildConfiguration(environment: AuthEnvironment) {
  if (environment.VITE_SAKEKEEP_DEMO_MODE === "true") {
    throw new Error(
      "Production authentication configuration rejected: VITE_SAKEKEEP_DEMO_MODE=true"
    )
  }

  const missing = ["VITE_CLERK_PUBLISHABLE_KEY"].filter((name) => !environment[name]?.trim())
  if (missing.length > 0) {
    throw new Error(`Missing required production Clerk configuration: ${missing.join(", ")}`)
  }
}

export function validateProductionAuthConfiguration(environment: AuthEnvironment) {
  validateProductionAuthBuildConfiguration(environment)

  if (!environment.CLERK_SECRET_KEY?.trim()) {
    throw new Error("Missing required production Clerk configuration: CLERK_SECRET_KEY")
  }
}
