/**
 * Integration and browser tests delete whole projects and reseed deterministic demo data. They
 * used to do that against whichever database and bucket happened to be in the environment, which
 * locally is the one a developer has their own work in.
 *
 * They now run against targets derived from the configured ones by name. The suffix is the guard:
 * anything that is not plainly a test target is refused before the first delete.
 */

const SUFFIX = "-test"

function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "")
}

function withDatabaseName(url: string, name: string): string {
  const parsed = new URL(url)
  parsed.pathname = `/${name}`
  return parsed.toString()
}

/** The database the tests own. Set `TEST_DATABASE_URL` to point them somewhere else entirely. */
export function testDatabaseUrl(environment: NodeJS.ProcessEnv = process.env): string {
  if (environment.TEST_DATABASE_URL) return environment.TEST_DATABASE_URL
  const url = environment.DATABASE_URL ?? "postgresql://sakekeep:sakekeep@127.0.0.1:54321/sakekeep"
  return withDatabaseName(url, `${databaseName(url)}${SUFFIX}`)
}

/** The bucket the tests own. Set `TEST_S3_BUCKET` to point them somewhere else entirely. */
export function testBucket(environment: NodeJS.ProcessEnv = process.env): string {
  return environment.TEST_S3_BUCKET ?? `${environment.S3_BUCKET ?? "sakekeep"}${SUFFIX}`
}

/** Everything a test run may write to, as environment overrides. */
export function testTargetEnvironment(environment: NodeJS.ProcessEnv = process.env): {
  DATABASE_URL: string
  S3_BUCKET: string
} {
  return { DATABASE_URL: testDatabaseUrl(environment), S3_BUCKET: testBucket(environment) }
}

/**
 * Refuses to go on unless the environment points at a test database and a test bucket. Called
 * before anything seeds or mutates, so a stray `DATABASE_URL` costs an error, not a day's work.
 */
export function assertTestTarget(environment: NodeJS.ProcessEnv = process.env): void {
  const problems: string[] = []
  const database = environment.DATABASE_URL ? databaseName(environment.DATABASE_URL) : ""
  if (!database.endsWith(SUFFIX)) {
    problems.push(`database "${database}" is not a test database`)
  }
  if (!environment.S3_BUCKET?.endsWith(SUFFIX)) {
    problems.push(`bucket "${environment.S3_BUCKET ?? ""}" is not a test bucket`)
  }
  if (problems.length > 0) {
    throw new Error(
      `Refusing to run tests against non-test targets (${problems.join("; ")}). ` +
        `Run them through "bun run test:integration" or "bun run test:e2e".`
    )
  }
}
