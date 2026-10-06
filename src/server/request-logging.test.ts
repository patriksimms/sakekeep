import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import Logger from "./logger.ts"
import { shutdownLogging } from "./logging.ts"
import { logRequest } from "./request-logging.ts"

const lines: string[] = []

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production")
  vi.stubEnv("POSTHOG_LOGS_ENABLED", "false")
  lines.length = 0
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    lines.push(String(chunk))
    return true
  })
})

afterEach(async () => {
  await shutdownLogging()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe("request logs", () => {
  it("correlates concurrent asynchronous work without recording private request data", async () => {
    const logger = new Logger("operation")
    await Promise.all(
      [
        "https://example.test/api/invitations/private-token?email=person@example.test",
        "https://example.test/api/projects/project-id/book",
      ].map((url) =>
        logRequest(
          new Request(url, {
            method: "POST",
            headers: { Authorization: "Bearer private-secret" },
            body: "private contributor answer",
          }),
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 1))
            logger.info("Operation completed")
            return { response: new Response(null, { status: 201 }) }
          }
        )
      )
    )
    const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>)
    const completed = entries.filter((entry) => entry.message === "Request completed")
    expect(completed).toHaveLength(2)
    expect(new Set(completed.map((entry) => entry.requestId)).size).toBe(2)
    expect(completed.map((entry) => entry.route)).toEqual([
      "/api/invitations/:id",
      "/api/projects/:id/book",
    ])
    for (const entry of completed) {
      expect(entry).toMatchObject({ status: 201, method: "POST", clientDisconnected: false })
      expect(entry.durationMs).toBeTypeOf("number")
      expect(
        entries.find(
          (other) => other.message === "Operation completed" && other.requestId === entry.requestId
        )
      ).toMatchObject({ route: entry.route })
    }
    const output = lines.join("")
    for (const secret of [
      "private-token",
      "person@example.test",
      "project-id",
      "private-secret",
      "private contributor answer",
    ]) {
      expect(output).not.toContain(secret)
    }
  })

  it("records failed requests and safe error stacks while excluding healthy probes", async () => {
    await logRequest(new Request("https://example.test/api/health"), () => ({
      response: new Response(),
    }))
    expect(lines).toHaveLength(0)
    await logRequest(new Request("https://example.test/api/health"), () => ({
      response: new Response(null, { status: 503 }),
    }))
    const failure = new Error(
      "Failed query: insert private contributor answer\nparams: private-token\n    at forged-frame private contributor answer",
      {
        cause: Object.assign(new Error('invalid input: "private contributor answer"'), {
          code: "22P02",
          detail: "private-token",
        }),
      }
    )
    await expect(
      logRequest(new Request("https://example.test/arbitrary-private-path"), () => {
        throw failure
      })
    ).rejects.toBe(failure)
    const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(entries[0]).toMatchObject({ status: 503, level: "ERROR" })
    const exception = entries.find((entry) => entry.message === "Request handler failed")
    expect(exception).toMatchObject({ route: "/unknown", "exception.type": "Error" })
    expect(exception?.["exception.stacktrace"]).toContain("request-logging.test.ts")
    expect(entries.at(-1)).toMatchObject({
      status: 500,
      level: "ERROR",
      requestId: exception?.requestId,
    })
    expect(lines.join("")).not.toMatch(
      /private contributor answer|private-token|arbitrary-private-path/
    )
  })
})
