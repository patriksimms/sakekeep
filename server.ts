import { relative, resolve, sep } from "node:path"

import { validateProductionAuthConfiguration } from "#/server/auth-config.ts"

const clientDirectory = resolve("dist/client")
const serverEntryPoint = resolve("dist/server/server.js")
const fingerprintedAsset = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/
const compressibleTypes = [
  "application/javascript",
  "application/json",
  "application/xml",
  "image/svg+xml",
]

type StartHandler = {
  fetch(request: Request): Response | Promise<Response>
}

export function resolveStaticPath(pathname: string): string | undefined {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return undefined
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return undefined
  const candidate = resolve(clientDirectory, `.${decoded}`)
  const relativePath = relative(clientDirectory, candidate)
  if (relativePath === "" || relativePath.startsWith(`..${sep}`) || relativePath === "..") {
    return undefined
  }
  return candidate
}

export function cacheControlFor(pathname: string): string {
  return fingerprintedAsset.test(pathname)
    ? "public, max-age=31536000, immutable"
    : "public, max-age=0, must-revalidate"
}

export function acceptsGzip(headers: Headers): boolean {
  return (headers.get("accept-encoding") ?? "")
    .split(",")
    .some((value) => value.trim().split(";")[0]?.toLowerCase() === "gzip")
}

function isCompressible(type: string): boolean {
  return type.startsWith("text/") || compressibleTypes.includes(type)
}

function etagFor(bytes: Uint8Array): string {
  return `W/"${Bun.hash(bytes).toString(16)}-${bytes.byteLength}"`
}

async function staticResponse(request: Request): Promise<Response | undefined> {
  if (request.method !== "GET" && request.method !== "HEAD") return undefined
  const url = new URL(request.url)
  const path = resolveStaticPath(url.pathname)
  if (!path) return undefined

  const file = Bun.file(path)
  if (!(await file.exists()) || file.size === 0) return undefined

  const bytes = new Uint8Array(await file.arrayBuffer())
  const etag = etagFor(bytes)
  const headers = new Headers({
    "Cache-Control": cacheControlFor(url.pathname),
    "Content-Type": file.type || "application/octet-stream",
    ETag: etag,
  })
  if (
    request.headers
      .get("if-none-match")
      ?.split(/\s*,\s*/)
      .includes(etag)
  ) {
    return new Response(null, { status: 304, headers })
  }

  let body = bytes
  if (bytes.byteLength >= 1024 && isCompressible(headers.get("content-type")!)) {
    headers.set("Vary", "Accept-Encoding")
    if (acceptsGzip(request.headers)) {
      body = Bun.gzipSync(bytes)
      headers.set("Content-Encoding", "gzip")
    }
  }
  headers.set("Content-Length", String(body.byteLength))
  return new Response(request.method === "HEAD" ? null : body, { headers })
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error"
}

export async function startServer() {
  if (process.env.NODE_ENV === "production") {
    validateProductionAuthConfiguration(process.env)
  }

  const port = Number(process.env.PORT ?? 3000)
  const hostname = process.env.HOST ?? "0.0.0.0"
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.")
  }

  const serverModule = (await import(serverEntryPoint)) as { default: StartHandler }
  if (typeof serverModule.default?.fetch !== "function") {
    throw new Error("dist/server/server.js does not export the expected fetch handler.")
  }
  const handler = serverModule.default

  const server = Bun.serve({
    hostname,
    port,
    async fetch(request) {
      try {
        return (await staticResponse(request)) ?? (await handler.fetch(request))
      } catch (error) {
        console.error(`[server] request failed: ${messageFor(error)}`)
        return new Response("Internal Server Error", { status: 500 })
      }
    },
    error(error) {
      console.error(`[server] uncaught error: ${messageFor(error)}`)
      return new Response("Internal Server Error", { status: 500 })
    },
  })

  let stopping = false
  const stop = async (signal: string) => {
    if (stopping) return
    stopping = true
    console.log(`[server] received ${signal}; stopping`)
    await server.stop()
    process.exit(0)
  }
  process.once("SIGTERM", () => void stop("SIGTERM"))
  process.once("SIGINT", () => void stop("SIGINT"))

  console.log(`[server] listening on http://${hostname}:${server.port}`)
  return server
}

if (import.meta.main) {
  startServer().catch((error: unknown) => {
    console.error(`[server] fatal startup error: ${messageFor(error)}`)
    process.exit(1)
  })
}
