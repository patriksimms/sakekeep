import { describe, expect, it } from "vitest"

import { parseEnvironment } from "./env"

const productionEnvironment = {
  NODE_ENV: "production",
  HOST: "0.0.0.0",
  PORT: "3000",
  DATABASE_URL: "postgresql://sakekeep:unique-password@postgres:5432/sakekeep",
  S3_ENDPOINT: "http://rustfs:9000",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "production-access-key",
  S3_SECRET_ACCESS_KEY: "production-secret-key",
  S3_BUCKET: "sakekeep-production",
  SHARE_TOKEN_SECRET: "a-unique-production-secret-that-is-longer-than-forty-eight-characters",
  APP_ORIGIN: "https://sakekeep.example.com",
  VITE_SAKEKEEP_DEMO_MODE: "false",
  VITE_CLERK_PUBLISHABLE_KEY: "pk_live_example",
  CLERK_SECRET_KEY: "sk_live_example",
}

describe("production environment", () => {
  it("accepts complete production configuration", () => {
    expect(parseEnvironment(productionEnvironment).NODE_ENV).toBe("production")
  })

  it("reports missing variables without echoing their values", () => {
    const { CLERK_SECRET_KEY: _secret, ...incomplete } = productionEnvironment
    expect(() => parseEnvironment(incomplete)).toThrow(/missing: CLERK_SECRET_KEY/)
  })

  it("treats PostHog as optional and defaults its host to the EU region", () => {
    const parsed = parseEnvironment(productionEnvironment)
    expect(parsed.VITE_POSTHOG_PROJECT_TOKEN).toBeUndefined()
    expect(parsed.POSTHOG_HOST).toBe("https://eu.i.posthog.com")

    const withPosthog = parseEnvironment({
      ...productionEnvironment,
      POSTHOG_HOST: "https://us.i.posthog.com",
      VITE_POSTHOG_PROJECT_TOKEN: "phc_production_token",
    })
    expect(withPosthog.VITE_POSTHOG_PROJECT_TOKEN).toBe("phc_production_token")
    expect(withPosthog.POSTHOG_HOST).toBe("https://us.i.posthog.com")
  })

  it("rejects demo mode, insecure origins, and local defaults", () => {
    expect(() =>
      parseEnvironment({
        ...productionEnvironment,
        APP_ORIGIN: "http://localhost:3000",
        VITE_SAKEKEEP_DEMO_MODE: "true",
        S3_SECRET_ACCESS_KEY: "sakekeep-local-only",
      })
    ).toThrow(/insecure: S3_SECRET_ACCESS_KEY, VITE_SAKEKEEP_DEMO_MODE, APP_ORIGIN/)
  })
})
