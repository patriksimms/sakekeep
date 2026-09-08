import { generateKeyPairSync, sign } from "node:crypto"

import { defineConfig } from "@playwright/test"

const port = Number(process.env.SAKEKEEP_E2E_PORT ?? 3000)
const authPort = port + 1
const authBaseUrl = `http://localhost:${authPort}`
const clerkPublishableKey = "pk_test_c2FrZWtlZXAuY2xlcmsuYWNjb3VudHMk"
const clerkSecretKey = "sk_test_sakekeep_ci"

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}

function createTestClerkConfiguration() {
  if (!process.env.SAKEKEEP_E2E_CLERK_PRIVATE_KEY || !process.env.SAKEKEEP_E2E_CLERK_PUBLIC_KEY) {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    })
    process.env.SAKEKEEP_E2E_CLERK_PRIVATE_KEY = privateKey
    process.env.SAKEKEEP_E2E_CLERK_PUBLIC_KEY = publicKey
  }

  const now = Math.floor(Date.now() / 1000)
  const header = encodeJson({ alg: "RS256", typ: "JWT", kid: "sakekeep-e2e" })
  const payload = encodeJson({
    azp: authBaseUrl,
    exp: now + 60 * 60,
    iat: now,
    nbf: now - 1,
    sid: "sess_sakekeep_e2e",
    sub: "user_sakekeep_e2e",
  })
  const input = `${header}.${payload}`
  const signature = sign("RSA-SHA256", Buffer.from(input), {
    key: process.env.SAKEKEEP_E2E_CLERK_PRIVATE_KEY,
  }).toString("base64url")
  process.env.SAKEKEEP_E2E_AUTH_BASE_URL = authBaseUrl
  process.env.SAKEKEEP_E2E_AUTH_TOKEN = `${input}.${signature}`

  return {
    publicKey: process.env.SAKEKEEP_E2E_CLERK_PUBLIC_KEY,
  }
}

const testClerk = createTestClerkConfiguration()

export default defineConfig({
  testDir: "./e2e",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  use: {
    baseURL: `http://localhost:${port}`,
    colorScheme: "light",
    locale: "en-US",
    extraHTTPHeaders: { "Accept-Language": "en-US" },
    trace: "retain-on-failure",
  },
  globalSetup: "./e2e/global-setup.ts",
  webServer: [
    {
      name: "demo",
      command: `bunx vite dev --port ${port}`,
      env: {
        ...process.env,
        VITE_SAKEKEEP_DEMO_MODE: "true",
        // Keep e2e deterministic: no PostHog init and no consent banner, even with a local token.
        VITE_POSTHOG_PROJECT_TOKEN: "",
      },
      url: `http://localhost:${port}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      name: "auth",
      command: `bunx vite dev --port ${authPort}`,
      env: {
        ...process.env,
        CLERK_JWT_KEY: testClerk.publicKey,
        CLERK_SECRET_KEY: clerkSecretKey,
        VITE_CLERK_PUBLISHABLE_KEY: clerkPublishableKey,
        VITE_SAKEKEEP_DEMO_MODE: "false",
        VITE_POSTHOG_PROJECT_TOKEN: "",
      },
      url: `${authBaseUrl}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
