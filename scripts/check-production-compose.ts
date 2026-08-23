import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"

const postgresPassword = "compose#validation/password?with@reserved:characters"
const databaseUrl =
  "postgresql://sakekeep:compose%23validation%2Fpassword%3Fwith%40reserved%3Acharacters@postgres:5432/sakekeep"
const validationEnvironment = {
  ...process.env,
  POSTGRES_PASSWORD: postgresPassword,
  DATABASE_URL: databaseUrl,
  S3_ENDPOINT: "https://objects.example.com",
  S3_REGION: "eu-central-1",
  S3_ACCESS_KEY_ID: "compose-validation-access-key",
  S3_SECRET_ACCESS_KEY: "compose-validation-object-store-secret",
  S3_BUCKET: "sakekeep-compose-validation",
  SHARE_TOKEN_SECRET: "compose-validation-share-token-secret-longer-than-forty-eight-characters",
  APP_ORIGIN: "https://sakekeep.example.com",
  VITE_CLERK_PUBLISHABLE_KEY: "pk_test_compose_validation",
  CLERK_SECRET_KEY: "sk_test_compose_validation",
}

const result = spawnSync(
  "docker",
  ["compose", "-f", "docker-compose.coolify.yml", "config", "--format", "json"],
  {
    env: validationEnvironment,
    encoding: "utf8",
  }
)
if (result.error) throw result.error
if (result.status !== 0) {
  process.stderr.write(result.stderr)
  process.exit(result.status ?? 1)
}

const config = JSON.parse(result.stdout) as {
  services: Record<
    string,
    {
      environment: Record<string, string>
      ports?: unknown[]
    }
  >
  volumes?: Record<string, unknown>
}
assert.equal(config.services.app?.environment.DATABASE_URL, databaseUrl)
assert.equal(config.services.migrate?.environment.DATABASE_URL, databaseUrl)
assert.equal(config.services.postgres?.environment.POSTGRES_PASSWORD, postgresPassword)
assert.equal(config.services.app?.environment.S3_ENDPOINT, validationEnvironment.S3_ENDPOINT)
assert.equal(config.services.migrate?.environment.S3_ENDPOINT, validationEnvironment.S3_ENDPOINT)
assert.equal(config.services.app?.environment.S3_REGION, validationEnvironment.S3_REGION)
assert.equal(config.services.migrate?.environment.S3_REGION, validationEnvironment.S3_REGION)
assert.equal(config.services.rustfs, undefined)
assert.equal(config.services["rustfs-permissions"], undefined)
assert.equal(config.services.app?.ports, undefined)
assert.equal(config.services.postgres?.ports, undefined)
assert.deepEqual(Object.keys(config.volumes ?? {}), ["postgres-data"])
assert.equal(
  decodeURIComponent(new URL(config.services.app.environment.DATABASE_URL).password),
  postgresPassword
)
