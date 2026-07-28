import { describe, expect, it } from "vitest"

import {
  validateProductionAuthBuildConfiguration,
  validateProductionAuthConfiguration,
} from "./auth-config.ts"

const configuredProduction = {
  VITE_SAKEKEEP_DEMO_MODE: "false",
  VITE_CLERK_PUBLISHABLE_KEY: "pk_live_example",
  CLERK_SECRET_KEY: "sk_live_example",
}

describe("production Clerk configuration", () => {
  it("accepts configured runtime authentication", () => {
    expect(() => validateProductionAuthConfiguration(configuredProduction)).not.toThrow()
  })

  it("accepts a build without the runtime-only secret", () => {
    const { CLERK_SECRET_KEY: _secret, ...buildEnvironment } = configuredProduction
    expect(() => validateProductionAuthBuildConfiguration(buildEnvironment)).not.toThrow()
  })

  it.each([validateProductionAuthBuildConfiguration, validateProductionAuthConfiguration])(
    "rejects demo mode",
    (validate) => {
      expect(() =>
        validate({
          ...configuredProduction,
          VITE_SAKEKEEP_DEMO_MODE: "true",
        })
      ).toThrow(/VITE_SAKEKEEP_DEMO_MODE=true/)
    }
  )

  it("rejects a build without VITE_CLERK_PUBLISHABLE_KEY", () => {
    expect(() =>
      validateProductionAuthBuildConfiguration({
        ...configuredProduction,
        VITE_CLERK_PUBLISHABLE_KEY: "",
      })
    ).toThrow(/VITE_CLERK_PUBLISHABLE_KEY/)
  })

  it.each(["VITE_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"])(
    "rejects a runtime without %s",
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
