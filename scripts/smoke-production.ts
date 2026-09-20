import { spawnSync } from "node:child_process"
import { generateKeyPairSync, randomBytes, sign } from "node:crypto"
import { rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

/**
 * Runs the shipped image end to end: contribute, export, recreate the container, and check that
 * everything is still there. The image verifies real signed JWTs; only the account provider
 * behind it is local, so this needs no Clerk tenant and no test account credentials and can run
 * as routine image verification.
 */
const origin = "http://127.0.0.1:33000"
const smokeUserId = "user_smoke"

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
})

function sessionToken(userId: string): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url")
  const now = Math.floor(Date.now() / 1000)
  const input = `${encode({ alg: "RS256", typ: "JWT", kid: "sakekeep-smoke" })}.${encode({
    sub: userId,
    sid: `sess_${userId}`,
    azp: origin,
    exp: now + 4 * 60 * 60,
    iat: now,
    nbf: now - 1,
  })}`
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`
}

const suffix = randomBytes(8).toString("hex")
const postgresPassword = `postgres-${randomBytes(24).toString("hex")}`
const statePath = join(tmpdir(), `sakekeep-production-smoke-${suffix}.json`)
const environment: NodeJS.ProcessEnv = {
  ...process.env,
  COMPOSE_PROJECT_NAME: `sakekeep-smoke-${suffix}`,
  POSTGRES_PASSWORD: postgresPassword,
  DATABASE_URL: `postgresql://sakekeep:${encodeURIComponent(postgresPassword)}@postgres:5432/sakekeep`,
  // The compose files require these to interpolate; the smoke overlay points the containers at
  // its own RustFS regardless, so the smoke does not depend on a configured shell.
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://rustfs:9000",
  S3_REGION: process.env.S3_REGION ?? "us-east-1",
  S3_ACCESS_KEY_ID: `smoke-${suffix}`,
  S3_SECRET_ACCESS_KEY: randomBytes(32).toString("hex"),
  S3_BUCKET: `sakekeep-smoke-${suffix}`,
  SHARE_TOKEN_SECRET: randomBytes(48).toString("hex"),
  APP_ORIGIN: "https://sakekeep.example.com",
  PRODUCTION_SMOKE: "true",
  // A production-style key on purpose. A development instance sends every browser navigation
  // through Clerk's hosted handshake to set its dev-browser cookie, and that host does not
  // exist here, so the public contribution form could never load. Production instances leave a
  // signed-out visitor alone, which is exactly what a contributor is.
  VITE_CLERK_PUBLISHABLE_KEY:
    process.env.VITE_CLERK_PUBLISHABLE_KEY ?? "pk_live_Y2xlcmsuc2FrZWtlZXAudGVzdCQ",
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? "sk_live_sakekeep_smoke",
  CLERK_JWT_KEY: publicKey,
  PRODUCTION_SMOKE_ORIGIN: origin,
  PRODUCTION_SMOKE_AUTH_TOKEN: sessionToken(smokeUserId),
}
const compose = ["compose", "-f", "docker-compose.coolify.yml", "-f", "docker-compose.smoke.yml"]

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { env: environment, stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`)
}

// The Playwright CLI directly: the repository's own e2e command prepares the local test
// database, which this suite has nothing to do with.
const playwright = [
  "node_modules/@playwright/test/cli.js",
  "test",
  "--config=playwright.production.config.ts",
  "e2e/production-smoke.spec.ts",
]

try {
  run("docker", [...compose, "config", "--quiet"])
  run("docker", [...compose, "build", "app", "migrate"])
  run("docker", [...compose, "up", "-d", "--wait"])
  run("docker", [...compose, "run", "--rm", "migrate", "bun", "run", "db:seed"])
  run("docker", [
    ...compose,
    "exec",
    "-T",
    "app",
    "bun",
    "run",
    "scripts/backfill-project-owners.ts",
    `${smokeUserId}@example.com`,
  ])
  Object.assign(environment, {
    PRODUCTION_SMOKE_PHASE: "create",
    PRODUCTION_SMOKE_STATE_PATH: statePath,
  })
  run("node", playwright)
  run("docker", [...compose, "up", "-d", "--wait", "--force-recreate", "app"])
  environment.PRODUCTION_SMOKE_PHASE = "verify"
  run("node", playwright)
} finally {
  // PRODUCTION_SMOKE_KEEP=1 leaves the stack up so a failure can be inspected. Tear it down
  // afterwards with the printed compose project name, or the published port stays taken.
  if (process.env.PRODUCTION_SMOKE_KEEP) {
    console.log(`Stack left running as ${environment.COMPOSE_PROJECT_NAME}.`)
  } else {
    run("docker", [...compose, "down", "--volumes", "--remove-orphans"])
    rmSync(statePath, { force: true })
  }
}
