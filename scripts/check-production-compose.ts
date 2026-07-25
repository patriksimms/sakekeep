import { spawnSync } from "node:child_process"

const validationEnvironment = {
  ...process.env,
  POSTGRES_PASSWORD: "compose-validation-postgres-password",
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
  ["compose", "-f", "docker-compose.coolify.yml", "config", "--quiet"],
  {
    env: validationEnvironment,
    stdio: "inherit",
  }
)
if (result.error) throw result.error
process.exit(result.status ?? 1)
