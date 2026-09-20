import { assertTestTarget, testTargetEnvironment } from "./target.ts"

/**
 * Points the integration project at the test database and bucket before any test file imports
 * the application's environment, which reads these once and caches them.
 */
Object.assign(process.env, testTargetEnvironment())
assertTestTarget()
