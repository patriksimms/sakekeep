import { spawn, type ChildProcess } from "node:child_process"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { once } from "node:events"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  acceptsGzip,
  cacheControlFor,
  idleTimeoutSeconds,
  isExportRequest,
  resolveStaticPath,
} from "../../server"

describe("native Bun server helpers", () => {
  it("keeps static paths inside the built client directory", () => {
    expect(resolveStaticPath("/assets/app-12345678.js")).toMatch(
      /dist[/\\]client[/\\]assets[/\\]app-12345678\.js$/
    )
    expect(resolveStaticPath("/../server/server.js")).toBeUndefined()
    expect(resolveStaticPath("/%2e%2e/server/server.js")).toBeUndefined()
    expect(resolveStaticPath("/assets/%2e%2e/%2e%2e/server/server.js")).toBeUndefined()
    expect(resolveStaticPath("/assets%5c..%5cserver.js")).toBeUndefined()
    expect(resolveStaticPath("/%E0%A4%A")).toBeUndefined()
  })

  it("caches only fingerprinted build assets immutably", () => {
    expect(cacheControlFor("/assets/index-a1b2c3d4.js")).toBe("public, max-age=31536000, immutable")
    expect(cacheControlFor("/manifest.json")).toBe("public, max-age=0, must-revalidate")
    expect(cacheControlFor("/index.html")).toBe("public, max-age=0, must-revalidate")
  })

  it("recognises only the export endpoint as a long-running request", () => {
    expect(
      isExportRequest("POST", "/api/projects/11111111-1111-4111-8111-111111111111/export")
    ).toBe(true)
    expect(
      isExportRequest("GET", "/api/projects/11111111-1111-4111-8111-111111111111/export")
    ).toBe(false)
    expect(isExportRequest("POST", "/api/projects/11111111-1111-4111-8111-111111111111/book")).toBe(
      false
    )
    expect(isExportRequest("POST", "/api/exports/11111111-1111-4111-8111-111111111111")).toBe(false)
  })

  it("rejects an unusable configured idle timeout instead of guessing", () => {
    expect(idleTimeoutSeconds(undefined)).toBe(10)
    expect(idleTimeoutSeconds("30")).toBe(30)
    expect(() => idleTimeoutSeconds("0")).toThrow()
    expect(() => idleTimeoutSeconds("256")).toThrow()
    expect(() => idleTimeoutSeconds("thirty")).toThrow()
  })

  it("parses gzip as an accepted content encoding", () => {
    expect(acceptsGzip(new Headers({ "Accept-Encoding": "br, gzip;q=0.8" }))).toBe(true)
    expect(acceptsGzip(new Headers({ "Accept-Encoding": "br" }))).toBe(false)
  })
})

describe("native Bun server", () => {
  let child: ChildProcess
  let directory: string
  let origin: string
  let stderr = ""

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "sakekeep-server-"))
    await mkdir(join(directory, "dist/client/assets"), { recursive: true })
    await mkdir(join(directory, "dist/server"), { recursive: true })
    await writeFile(join(directory, "dist/client/assets/app-12345678.js"), "x".repeat(2_000))
    await writeFile(join(directory, "dist/client/manifest.json"), '{"name":"test"}')
    await writeFile(
      join(directory, "dist/server/server.js"),
      `export default {
        async fetch(request) {
          const url = new URL(request.url)
          // Far longer than the idle timeout the test server runs with.
          if (url.pathname.endsWith("/export")) {
            await Bun.sleep(5_000)
            return new Response("slow finished", { headers: { "Content-Type": "text/plain" } })
          }
          const body = await request.text()
          const headers = new Headers({ "Cache-Control": "no-store", "Content-Type": "text/plain" })
          headers.append("Set-Cookie", "first=1; Path=/")
          headers.append("Set-Cookie", "second=2; Path=/")
          return new Response(new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(request.method + "|" + new URL(request.url).pathname + "|"))
              controller.enqueue(new TextEncoder().encode(body))
              controller.close()
            }
          }), { headers })
        }
      }`
    )

    const probe = createServer()
    probe.listen(0, "127.0.0.1")
    await once(probe, "listening")
    const address = probe.address()
    if (!address || typeof address === "string") throw new Error("Could not allocate a test port.")
    const port = address.port
    await new Promise<void>((resolveClose) => probe.close(() => resolveClose()))

    origin = `http://127.0.0.1:${port}`
    child = spawn("bun", [resolve("server.ts")], {
      cwd: directory,
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: String(port),
        // Two seconds instead of ten keeps the timeout test quick and its outcome unambiguous.
        SERVER_IDLE_TIMEOUT_SECONDS: "2",
      },
      stdio: ["ignore", "pipe", "pipe"],
    })
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    await new Promise<void>((resolveStarted, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server did not start. ${stderr}`)), 10_000)
      child.once("exit", (code) => {
        clearTimeout(timer)
        reject(new Error(`Server exited with ${code}. ${stderr}`))
      })
      child.stdout?.on("data", (chunk: Buffer) => {
        if (chunk.toString().includes("[server] listening")) {
          clearTimeout(timer)
          resolveStarted()
        }
      })
    })
  })

  afterAll(async () => {
    child?.kill("SIGTERM")
    if (child?.exitCode === null) await once(child, "exit")
    await rm(directory, { recursive: true, force: true })
  })

  it("serves fingerprinted files with compression and conditional requests", async () => {
    const response = await fetch(`${origin}/assets/app-12345678.js`, {
      headers: { "Accept-Encoding": "gzip" },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
    expect(response.headers.get("content-encoding")).toBe("gzip")
    expect(await response.text()).toBe("x".repeat(2_000))

    const conditional = await fetch(`${origin}/assets/app-12345678.js`, {
      headers: { "If-None-Match": response.headers.get("etag")! },
    })
    expect(conditional.status).toBe(304)

    const manifest = await fetch(`${origin}/manifest.json`)
    expect(manifest.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate")
  })

  it("answers an export that runs well past the configured idle timeout", async () => {
    // The server below runs with a two-second idle timeout and the handler takes five, so this
    // only answers because the export path asks for a timeout of its own.
    const exported = await fetch(
      `${origin}/api/projects/11111111-1111-4111-8111-111111111111/export`,
      { method: "POST", body: "{}" }
    )
    expect(exported.status).toBe(200)
    expect(await exported.text()).toBe("slow finished")
  })

  it("forwards dynamic request semantics and preserves streamed cookies", async () => {
    const response = await fetch(`${origin}/api/example`, {
      method: "POST",
      body: "streamed-body",
    })
    expect(await response.text()).toBe("POST|/api/example|streamed-body")
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.getSetCookie()).toEqual(["first=1; Path=/", "second=2; Path=/"])
  })
})
