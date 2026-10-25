import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { HEALTH_CHECK_TIMEOUT_MS, runHealthCheck } from "./health.ts"
import { initializeLogging, shutdownLogging } from "./logging.ts"

const lines: string[] = []

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production")
  vi.stubEnv("POSTHOG_LOGS_ENABLED", "false")
  lines.length = 0
  initializeLogging()
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    lines.push(String(chunk))
    return true
  })
})

afterEach(async () => {
  vi.useRealTimers()
  await shutdownLogging()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function records(): Record<string, unknown>[] {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>)
}

describe("health checks", () => {
  it("passes when the dependency answers", async () => {
    await expect(runHealthCheck("database", async () => {})).resolves.toBe("ok")
    expect(lines).toEqual([])
  })

  it("names the dependency that failed", async () => {
    const status = await runHealthCheck("objectStore", async () => {
      throw new Error("Access Denied")
    })

    expect(status).toBe("error")
    expect(records()).toContainEqual(
      expect.objectContaining({
        level: "WARN",
        message: "Health check failed",
        check: "objectStore",
        "exception.message": "Access Denied",
      })
    )
  })

  it("fails and aborts a dependency that does not answer in time", async () => {
    vi.useFakeTimers()
    let aborted: unknown
    const status = runHealthCheck(
      "objectStore",
      (signal) =>
        new Promise<void>(() => {
          signal.addEventListener("abort", () => (aborted = signal.reason))
        })
    )

    await vi.advanceTimersByTimeAsync(HEALTH_CHECK_TIMEOUT_MS)

    await expect(status).resolves.toBe("error")
    expect(aborted).toBeInstanceOf(Error)
    expect(records()).toContainEqual(
      expect.objectContaining({
        check: "objectStore",
        "exception.message": `objectStore did not answer within ${HEALTH_CHECK_TIMEOUT_MS} ms`,
      })
    )
  })
})
