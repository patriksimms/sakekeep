import { z } from "zod"

const environmentSchema = z.object({
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
  SAKEKEEP_DEMO_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
})

let cached: z.infer<typeof environmentSchema> | undefined

export function env() {
  cached ??= environmentSchema.parse(process.env)
  return cached
}
