import { z } from "zod"

const commonEnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.string().url().default("postgresql://sakekeep:sakekeep@127.0.0.1:54321/sakekeep"),
  S3_ENDPOINT: z.string().url().default("http://127.0.0.1:19000"),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().min(1).default("sakekeep"),
  S3_SECRET_ACCESS_KEY: z.string().min(8).default("sakekeep-local-only"),
  S3_BUCKET: z.string().min(3).max(63).default("sakekeep"),
  SHARE_TOKEN_SECRET: z
    .string()
    .min(32)
    .default("sakekeep-local-share-token-secret-change-before-any-nonlocal-use"),
  APP_ORIGIN: z.string().url().default("http://localhost:3000"),
  VITE_SAKEKEEP_DEMO_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  VITE_CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  POSTHOG_HOST: z.string().url().default("https://eu.i.posthog.com"),
  // An empty string counts as unset so callers can explicitly disable PostHog.
  VITE_POSTHOG_PROJECT_TOKEN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional()
  ),
})

export type Environment = z.infer<typeof commonEnvironmentSchema>

const insecureProductionValues: Partial<Record<keyof Environment, readonly unknown[]>> = {
  DATABASE_URL: ["postgresql://sakekeep:sakekeep@127.0.0.1:54321/sakekeep"],
  S3_ENDPOINT: ["http://127.0.0.1:19000"],
  S3_ACCESS_KEY_ID: ["sakekeep"],
  S3_SECRET_ACCESS_KEY: ["sakekeep-local-only"],
  SHARE_TOKEN_SECRET: [
    "sakekeep-local-share-token-secret-change-before-any-nonlocal-use",
    "replace-this-local-development-secret-with-at-least-32-characters",
  ],
}

export function parseEnvironment(input: NodeJS.ProcessEnv): Environment {
  const parsed = commonEnvironmentSchema.safeParse(input)
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].filter(
      Boolean
    )
    throw new Error(`Invalid environment variables: ${names.join(", ")}`)
  }

  const configuration = parsed.data
  if (configuration.NODE_ENV !== "production") return configuration

  const missing = [
    "DATABASE_URL",
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_BUCKET",
    "SHARE_TOKEN_SECRET",
    "APP_ORIGIN",
    "VITE_SAKEKEEP_DEMO_MODE",
    "VITE_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
  ].filter((name) => !input[name])

  const insecure = Object.entries(insecureProductionValues)
    .filter(([name, values]) => values?.includes(configuration[name as keyof Environment]))
    .map(([name]) => name)

  if (configuration.VITE_SAKEKEEP_DEMO_MODE) insecure.push("VITE_SAKEKEEP_DEMO_MODE")
  if (!configuration.APP_ORIGIN.startsWith("https://")) insecure.push("APP_ORIGIN")
  if (configuration.SHARE_TOKEN_SECRET.length < 48) insecure.push("SHARE_TOKEN_SECRET")

  const problems = [
    missing.length > 0 ? `missing: ${missing.join(", ")}` : "",
    insecure.length > 0 ? `insecure: ${[...new Set(insecure)].join(", ")}` : "",
  ].filter(Boolean)
  if (problems.length > 0) {
    throw new Error(`Production environment rejected (${problems.join("; ")})`)
  }
  return configuration
}

let cached: Environment | undefined

export function env() {
  cached ??= parseEnvironment(process.env)
  return cached
}
