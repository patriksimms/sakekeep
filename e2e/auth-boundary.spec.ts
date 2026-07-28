import { expect, request, test, type APIRequestContext } from "@playwright/test"

import { shareTokenForProject } from "../src/server/share-token.ts"

const collectingProjectId = "22222222-2222-4222-8222-222222222222"
const collectingToken = shareTokenForProject(collectingProjectId)
const missingProjectId = "99999999-9999-4999-8999-999999999999"
const missingResourceId = "88888888-8888-4888-8888-888888888888"

const organizerRequests = [
  ["GET", "/projects"],
  ["GET", `/projects/${missingProjectId}`],
  ["GET", "/layout-parity"],
  ["GET", "/api/projects"],
  ["POST", "/api/projects"],
  ["GET", `/api/projects/${missingProjectId}`],
  ["PATCH", `/api/projects/${missingProjectId}`],
  ["DELETE", `/api/projects/${missingProjectId}`],
  ["POST", `/api/projects/${missingProjectId}/close`],
  ["POST", `/api/projects/${missingProjectId}/duplicate`],
  ["POST", `/api/projects/${missingProjectId}/publish`],
  ["POST", `/api/projects/${missingProjectId}/assets`],
  ["POST", `/api/projects/${missingProjectId}/layouts`],
  ["PATCH", `/api/projects/${missingProjectId}/layouts/${missingResourceId}`],
  ["DELETE", `/api/projects/${missingProjectId}/layouts/${missingResourceId}`],
  ["POST", `/api/projects/${missingProjectId}/book`],
  ["PATCH", `/api/projects/${missingProjectId}/book`],
  ["POST", `/api/projects/${missingProjectId}/export`],
  ["GET", `/api/assets/${missingResourceId}`],
  ["GET", `/api/exports/${missingResourceId}`],
] as const

const authBaseUrl = process.env.SAKEKEEP_E2E_AUTH_BASE_URL
const authToken = process.env.SAKEKEEP_E2E_AUTH_TOKEN

if (!authBaseUrl || !authToken) {
  throw new Error("The auth-enabled Playwright server configuration is unavailable.")
}

async function send(
  context: APIRequestContext,
  method: (typeof organizerRequests)[number][0],
  pathname: string
) {
  return context.fetch(pathname, {
    method,
    data: method === "GET" || method === "DELETE" ? undefined : {},
    maxRedirects: 0,
  })
}

async function sendAdmitted(
  context: APIRequestContext,
  method: (typeof organizerRequests)[number][0],
  pathname: string
) {
  if (method === "POST" && pathname === "/api/projects") {
    return context.post(pathname, {
      data: { title: "Auth boundary temporary project" },
      maxRedirects: 0,
    })
  }
  if (method === "PATCH" && pathname === `/api/projects/${missingProjectId}`) {
    return context.patch(pathname, {
      data: { title: "Auth boundary update" },
      maxRedirects: 0,
    })
  }
  if (method === "POST" && pathname.endsWith("/assets")) {
    return context.post(pathname, {
      multipart: { probe: "auth-boundary" },
      maxRedirects: 0,
    })
  }
  if (method === "POST" && pathname.endsWith("/layouts")) {
    return context.post(pathname, {
      data: { action: "create", name: "Auth boundary layout" },
      maxRedirects: 0,
    })
  }
  if (method === "PATCH" && pathname.includes("/layouts/")) {
    return context.patch(pathname, {
      data: { expectedRevision: 0, name: "Auth boundary layout" },
      maxRedirects: 0,
    })
  }
  if (method === "POST" && pathname.endsWith("/book")) {
    return context.post(pathname, {
      data: {
        mode: "cycle",
        seed: "auth-boundary",
        manualAssignments: {},
        resolutionOverrides: [],
      },
      maxRedirects: 0,
    })
  }
  return send(context, method, pathname)
}

test.describe.serial("Clerk request boundary", () => {
  let signedOut: APIRequestContext
  let admitted: APIRequestContext

  test.beforeAll(async () => {
    signedOut = await request.newContext({ baseURL: authBaseUrl })
    admitted = await request.newContext({
      baseURL: authBaseUrl,
      extraHTTPHeaders: { Authorization: `Bearer ${authToken}` },
    })
  })

  test.afterAll(async () => {
    await Promise.all([signedOut.dispose(), admitted.dispose()])
  })

  test("denies every signed-out organizer operation at the real middleware boundary", async () => {
    for (const [method, pathname] of organizerRequests) {
      const response = await send(signedOut, method, pathname)
      if (pathname.startsWith("/api/")) {
        expect(response.status(), `${method} ${pathname}`).toBe(401)
        expect(response.headers()["content-type"], `${method} ${pathname}`).toMatch(
          /^application\/json/
        )
        expect(await response.json()).toEqual({ error: "Authentication required." })
      } else {
        expect(response.status(), `${method} ${pathname}`).toBe(307)
        expect(response.headers().location, `${method} ${pathname}`).toContain(
          "/sign-in?redirect_url="
        )
      }
    }
  })

  test("preserves the organizer page return path without accepting another origin", async () => {
    const response = await signedOut.get("/projects/project-id?tab=layouts", {
      maxRedirects: 0,
    })

    expect(response.status()).toBe(307)
    expect(response.headers().location).toBe(
      `${authBaseUrl}/sign-in?redirect_url=%2Fprojects%2Fproject-id%3Ftab%3Dlayouts`
    )
  })

  test("lets an admitted Clerk session reach every organizer operation", async () => {
    let temporaryProjectId: string | undefined
    try {
      for (const [method, pathname] of organizerRequests) {
        const response = await sendAdmitted(admitted, method, pathname)
        expect(response.status(), `${method} ${pathname}`).not.toBe(401)
        expect(response.status(), `${method} ${pathname}`).toBeLessThan(500)
        expect(response.headers().location ?? "", `${method} ${pathname}`).not.toContain("/sign-in")
        if (method === "POST" && pathname === "/api/projects") {
          temporaryProjectId = ((await response.json()) as { id: string }).id
        }
      }

      expect((await admitted.get("/projects")).status()).toBe(200)
      expect((await admitted.get("/api/projects")).status()).toBe(200)
    } finally {
      if (temporaryProjectId) {
        expect((await admitted.delete(`/api/projects/${temporaryProjectId}`)).status()).toBe(204)
      }
    }
  })

  test("keeps contribution loading and submission anonymous while auth is enabled", async () => {
    const form = await signedOut.get(`/api/share/${collectingToken}`)
    expect(form.status()).toBe(200)
    await expect(form.json()).resolves.toMatchObject({
      status: "collecting",
      title: "Mina’s 30th birthday",
    })

    const submission = await signedOut.post(`/api/share/${collectingToken}`, {
      multipart: {
        payload: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          answers: {
            name: "Auth boundary contributor",
            memory: "The anonymous workflow remains open.",
            superpower: ["calm"],
            future: [],
          },
        }),
      },
    })
    expect(submission.status()).toBe(201)
    await expect(submission.json()).resolves.toMatchObject({
      created: true,
      message: "Your response was submitted.",
    })
  })

  test("keeps invalid shares isolated and health public", async () => {
    const invalidShare = await signedOut.get("/api/share/not-a-valid-token")
    expect(invalidShare.status()).toBe(404)
    await expect(invalidShare.json()).resolves.toEqual({
      status: "unknown",
      message: "This share link is unknown or malformed.",
    })

    expect((await signedOut.get("/api/health")).status()).toBe(200)
  })
})
