import { describe, expect, it } from "vitest"

import { assertTestTarget, testTargetEnvironment } from "./target.ts"

const development = {
  DATABASE_URL: "postgresql://sakekeep:sakekeep@127.0.0.1:54321/sakekeep",
  S3_BUCKET: "sakekeep",
}

describe("test targets", () => {
  it("derives its own database and bucket from the configured ones", () => {
    expect(testTargetEnvironment(development)).toEqual({
      DATABASE_URL: "postgresql://sakekeep:sakekeep@127.0.0.1:54321/sakekeep-test",
      S3_BUCKET: "sakekeep-test",
    })
  })

  it("keeps an explicitly configured target", () => {
    expect(
      testTargetEnvironment({
        ...development,
        TEST_DATABASE_URL: "postgresql://ci:ci@db:5432/ci-test",
        TEST_S3_BUCKET: "ci-test",
      })
    ).toEqual({ DATABASE_URL: "postgresql://ci:ci@db:5432/ci-test", S3_BUCKET: "ci-test" })
  })

  it("refuses to run against anything that is not plainly a test target", () => {
    // The whole point: a seed against these would delete a developer's demo projects.
    expect(() => assertTestTarget(development)).toThrow(/not a test database/)
    expect(() => assertTestTarget({ ...development, S3_BUCKET: "sakekeep-test" })).toThrow(
      /not a test database/
    )
    expect(() =>
      assertTestTarget({ ...testTargetEnvironment(development), S3_BUCKET: "sakekeep" })
    ).toThrow(/not a test bucket/)
    expect(() => assertTestTarget(testTargetEnvironment(development))).not.toThrow()
  })
})
