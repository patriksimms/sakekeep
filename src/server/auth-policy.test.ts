import { describe, expect, it } from "vitest"

import { authorizationResponse, routeAccess, signedOutResponse } from "./auth-policy.ts"

const organizerRequests = [
  ["GET", "/projects"],
  ["GET", "/projects/6eaa309a-1866-4dc9-999f-e2f7af3a8af4"],
  ["GET", "/layout-parity"],
  ["GET", "/api/projects"],
  ["POST", "/api/projects"],
  ["GET", "/api/projects/project-id"],
  ["PATCH", "/api/projects/project-id"],
  ["DELETE", "/api/projects/project-id"],
  ["POST", "/api/projects/project-id/close"],
  ["POST", "/api/projects/project-id/duplicate"],
  ["POST", "/api/projects/project-id/publish"],
  ["POST", "/api/projects/project-id/assets"],
  ["POST", "/api/projects/project-id/layouts"],
  ["PATCH", "/api/projects/project-id/layouts/layout-id"],
  ["DELETE", "/api/projects/project-id/layouts/layout-id"],
  ["POST", "/api/projects/project-id/book"],
  ["PATCH", "/api/projects/project-id/book"],
  ["POST", "/api/projects/project-id/export"],
  ["GET", "/api/assets/asset-id"],
  ["GET", "/api/exports/export-id"],
] as const

describe("organizer route policy", () => {
  it.each(organizerRequests)("protects %s %s for signed-out users", (method, pathname) => {
    expect(routeAccess(pathname)).toBe("organizer")

    const response = signedOutResponse(
      new Request(`https://sakekeep.example${pathname}`, { method })
    )
    if (pathname.startsWith("/api/")) {
      expect(response.status).toBe(401)
      expect(response.headers.get("content-type")).toMatch(/^application\/json/)
    } else {
      expect(response.status).toBe(307)
      expect(response.headers.get("location")).toContain("/sign-in?redirect_url=")
    }
  })

  it("redirects a signed-out organizer page with a same-origin return path", () => {
    const response = signedOutResponse(
      new Request("https://sakekeep.example/projects/project-id?tab=layouts")
    )

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(
      "https://sakekeep.example/sign-in?redirect_url=%2Fprojects%2Fproject-id%3Ftab%3Dlayouts"
    )
  })

  it.each(organizerRequests)("allows an admitted signed-in user to %s %s", (method, pathname) => {
    expect(
      authorizationResponse(new Request(`https://sakekeep.example${pathname}`, { method }), true)
    ).toBeUndefined()
  })

  it.each([
    "/",
    "/sign-in",
    "/sign-in/factor-one",
    "/sign-up",
    "/sign-up/verify-email-address",
    "/s/invalid-token",
    "/api/share/invalid-token",
    "/api/health",
    "/api/health/",
    "/favicon.ico",
    "/imprint",
    "/imprint/",
    "/_build/app.js",
  ])("keeps %s public", (pathname) => {
    expect(routeAccess(pathname)).toBe("public")
  })

  it.each([
    "/api/share",
    "/api/share/token/private",
    "/s",
    "/s/token/private",
    "/api/new-organizer-resource",
    "/new-organizer-page",
  ])("fails closed for unlisted or malformed route %s", (pathname) => {
    expect(routeAccess(pathname)).toBe("organizer")
  })
})
