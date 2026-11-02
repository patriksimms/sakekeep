import { once } from "node:events"
import { createServer, type IncomingHttpHeaders, type Server } from "node:http"
import type { AddressInfo } from "node:net"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import Logger from "./logger.ts"
import { initializeLogging, shutdownLogging } from "./logging.ts"

interface ReceivedExport {
  path: string | undefined
  headers: IncomingHttpHeaders
  body: string
}

let server: Server
const received: ReceivedExport[] = []

beforeEach(async () => {
  received.length = 0
  server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on("data", (chunk: Buffer) => chunks.push(chunk))
    request.on("end", () => {
      received.push({
        path: request.url,
        headers: request.headers,
        body: Buffer.concat(chunks).toString(),
      })
      response.writeHead(200, { "content-type": "application/json" }).end("{}")
    })
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const { port } = server.address() as AddressInfo
  vi.stubEnv("NODE_ENV", "production")
  vi.stubEnv("POSTHOG_LOGS_ENABLED", "true")
  vi.stubEnv("POSTHOG_HOST", `http://127.0.0.1:${port}`)
  vi.stubEnv("VITE_POSTHOG_PROJECT_TOKEN", "phc_test_token")
  vi.stubEnv("VITE_SAKEKEEP_DEMO_MODE", "false")
  vi.spyOn(process.stdout, "write").mockImplementation(() => true)
})

afterEach(async () => {
  await shutdownLogging()
  server.close()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe("PostHog log export", () => {
  it("sends redacted OTLP log records to PostHog when logging shuts down", async () => {
    initializeLogging()
    new Logger("export").error("Export failed", {
      email: "person@example.test",
      pages: 12,
      error: new Error("Upload to https://bucket.example.test/private failed"),
    })

    await shutdownLogging()

    expect(received).toHaveLength(1)
    const [request] = received
    expect(request.path).toBe("/i/v1/logs")
    expect(request.headers.authorization).toBe("Bearer phc_test_token")
    expect(request.body).not.toContain("person@example.test")
    expect(request.body).not.toContain("bucket.example.test")

    const payload = JSON.parse(request.body)
    const resourceLogs = payload.resourceLogs[0]
    const attribute = (attributes: Array<{ key: string; value: Record<string, unknown> }>) =>
      Object.fromEntries(attributes.map(({ key, value }) => [key, Object.values(value)[0]]))

    expect(attribute(resourceLogs.resource.attributes)).toMatchObject({
      "service.name": "sakekeep",
      "deployment.environment.name": "production",
    })
    const [record] = resourceLogs.scopeLogs[0].logRecords
    expect(record).toMatchObject({
      severityNumber: 17,
      severityText: "ERROR",
      body: { stringValue: "Export failed" },
    })
    expect(attribute(record.attributes)).toMatchObject({
      logger: "export",
      email: "[redacted email]",
      pages: 12,
      "exception.message": "Upload to [redacted URL] failed",
    })
  })
})
