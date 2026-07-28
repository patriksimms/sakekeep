import { describe, expect, it } from "vitest"

import { validateProductionAuthConfiguration } from "./auth-config.ts"

const configuredProduction = {
  VITE_SAKEKEEP_DEMO_MODE: "false",
  VITE_CLERK_PUBLISHABLE_KEY: "pk_live_example",
  CLERK_SECRET_KEY: "sk_live_example",
}

describe("production Clerk configuration", () => {
  it("accepts configured authentication", () => {
    expect(() => validateProductionAuthConfiguration(configuredProduction)).not.toThrow()
  })

  it("rejects demo mode", () => {
    expect(() =>
      validateProductionAuthConfiguration({
        ...configuredProduction,
        VITE_SAKEKEEP_DEMO_MODE: "true",
      })
    ).toThrow(/VITE_SAKEKEEP_DEMO_MODE=true/)
  })

  it.each(["VITE_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"])(
    "rejects a build without %s",
    (name) => {
      expect(() =>
        validateProductionAuthConfiguration({
          ...configuredProduction,
          [name]: "",
        })
      ).toThrow(name)
    }
  )
})
