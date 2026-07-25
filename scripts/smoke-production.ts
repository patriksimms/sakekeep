import { spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"

const required = [
  "VITE_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_TEST_USER_EMAIL",
  "CLERK_TEST_USER_PASSWORD",
] as const
const missing = required.filter((name) => !process.env[name])
if (missing.length > 0) {
  throw new Error(`Production smoke test requires: ${missing.join(", ")}`)
}

const suffix = randomBytes(8).toString("hex")
const environment = {
  ...process.env,
  COMPOSE_PROJECT_NAME: `sakekeep-smoke-${suffix}`,
  POSTGRES_PASSWORD: `postgres-${randomBytes(24).toString("hex")}`,
  S3_ACCESS_KEY_ID: `smoke-${suffix}`,
  S3_SECRET_ACCESS_KEY: randomBytes(32).toString("hex"),
  S3_BUCKET: `sakekeep-smoke-${suffix}`,
  SHARE_TOKEN_SECRET: randomBytes(48).toString("hex"),
  APP_ORIGIN: "https://sakekeep.example.com",
  PRODUCTION_SMOKE: "true",
}
const compose = ["compose", "-f", "docker-compose.coolify.yml", "-f", "docker-compose.smoke.yml"]

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { env: environment, stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`)
}

try {
  run("docker", [...compose, "config", "--quiet"])
  run("docker", [...compose, "build", "app", "migrate"])
  run("docker", [...compose, "up", "-d", "--wait"])
  run("docker", [...compose, "run", "--rm", "migrate", "bun", "run", "db:seed"])
  run("docker", [...compose, "up", "-d", "--wait", "--force-recreate", "app"])
  run("bun", [
    "run",
    "test:e2e",
    "--",
    "--config=playwright.production.config.ts",
    "e2e/production-smoke.spec.ts",
  ])
} finally {
  run("docker", [...compose, "down", "--volumes", "--remove-orphans"])
}
