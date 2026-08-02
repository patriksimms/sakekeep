import { env, type Environment } from "#/server/env.ts"

// Only these request headers reach PostHog. An allowlist (rather than a blocklist) guarantees
// client IP headers such as X-Forwarded-For, X-Real-IP, or CF-Connecting-IP are never forwarded.
const FORWARDED_REQUEST_HEADERS = ["content-type", "user-agent"] as const

// The upstream response is decompressed by fetch, so its encoding/length headers no longer match.
const DROPPED_RESPONSE_HEADERS = ["content-encoding", "content-length", "transfer-encoding"]

const STATIC_ASSET_HOSTS: Record<string, string> = {
  "https://eu.i.posthog.com": "https://eu-assets.i.posthog.com",
  "https://us.i.posthog.com": "https://us-assets.i.posthog.com",
}

export function upstreamUrlFor(posthogHost: string, splat: string, search: string): string {
  const host = posthogHost.replace(/\/+$/, "")
  const base =
    splat === "static" || splat.startsWith("static/") ? (STATIC_ASSET_HOSTS[host] ?? host) : host
  return `${base}/${splat}${search}`
}

export function upstreamRequestHeaders(incoming: Headers): Headers {
  const headers = new Headers()
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = incoming.get(name)
    if (value) headers.set(name, value)
  }
  return headers
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export async function proxyPosthogRequest(
  request: Request,
  splat: string,
  configuration: Pick<Environment, "POSTHOG_HOST" | "VITE_POSTHOG_PROJECT_TOKEN"> = env(),
  fetchImplementation: FetchLike = fetch
): Promise<Response> {
  if (!configuration.VITE_POSTHOG_PROJECT_TOKEN) {
    return Response.json({ error: "PostHog ingestion is not configured." }, { status: 404 })
  }

  const url = new URL(request.url)
  const upstreamUrl = upstreamUrlFor(configuration.POSTHOG_HOST, splat, url.search)
  const body =
    request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer()

  let upstreamResponse: Response
  try {
    upstreamResponse = await fetchImplementation(upstreamUrl, {
      method: request.method,
      headers: upstreamRequestHeaders(request.headers),
      body,
      redirect: "manual",
    })
  } catch {
    return Response.json({ error: "PostHog ingestion is unavailable." }, { status: 502 })
  }

  const headers = new Headers(upstreamResponse.headers)
  for (const name of DROPPED_RESPONSE_HEADERS) headers.delete(name)
  return new Response(upstreamResponse.body, { status: upstreamResponse.status, headers })
}
