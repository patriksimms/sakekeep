import * as m from "#/paraglide/messages.js"
import { createMiddleware } from "@tanstack/react-start"

const PUBLIC_EXACT_PATHS = new Set([
  "/",
  "/api/health",
  "/favicon.ico",
  "/favicon.svg",
  "/imprint",
  "/logo192.png",
  "/logo512.png",
  "/manifest.json",
  "/privacy",
  "/robots.txt",
  "/layout-parity-decor.svg",
  "/layout-parity-landscape.svg",
  "/layout-parity-portrait.svg",
])

const PUBLIC_ASSET_PREFIXES = [
  "/_build/",
  "/assets/",
  "/@fs/",
  "/@id/",
  "/@vite/",
  "/node_modules/",
  "/src/",
]

export type RouteAccess = "organizer" | "public"

type ClerkRequestContext = {
  auth?: (options?: {
    treatPendingAsSignedOut?: boolean
  }) => { isAuthenticated: boolean } | Promise<{ isAuthenticated: boolean }>
}

export function routeAccess(pathname: string): RouteAccess {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
  if (PUBLIC_EXACT_PATHS.has(normalizedPath)) return "public"
  if (PUBLIC_ASSET_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))) return "public"
  if (normalizedPath === "/sign-in" || normalizedPath.startsWith("/sign-in/")) return "public"
  if (normalizedPath === "/sign-up" || normalizedPath.startsWith("/sign-up/")) return "public"
  // PostHog ingestion proxy: events arrive from consented but not necessarily signed-in browsers.
  if (normalizedPath.startsWith("/ingest/")) return "public"
  if (/^\/s\/[^/]+$/.test(normalizedPath)) return "public"
  if (/^\/api\/share\/[^/]+$/.test(normalizedPath)) return "public"
  return "organizer"
}

export function signedOutResponse(request: Request): Response {
  const url = new URL(request.url)
  if (url.pathname.startsWith("/api/")) {
    return Response.json(
      { error: m.ui_authentication_required() },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
          "WWW-Authenticate": "Bearer",
        },
      }
    )
  }

  const signInUrl = new URL("/sign-in", url.origin)
  signInUrl.searchParams.set("redirect_url", `${url.pathname}${url.search}`)
  return new Response(null, {
    status: 307,
    headers: {
      "Cache-Control": "no-store",
      Location: signInUrl.toString(),
    },
  })
}

export function authorizationResponse(
  request: Request,
  isAuthenticated: boolean
): Response | undefined {
  if (routeAccess(new URL(request.url).pathname) === "public" || isAuthenticated) return
  return signedOutResponse(request)
}

export const authorizationMiddleware = createMiddleware({ type: "request" }).server(
  async ({ context, request, next }) => {
    if (routeAccess(new URL(request.url).pathname) === "public") {
      return next()
    }

    const authenticate = (context as ClerkRequestContext | undefined)?.auth
    if (!authenticate) {
      throw new Error(m.ui_clerk_authentication_context_is_unavailable())
    }
    const { isAuthenticated } = await authenticate({ treatPendingAsSignedOut: true })
    return authorizationResponse(request, isAuthenticated) ?? next()
  }
)
