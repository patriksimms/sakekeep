import { DEFAULT_TEXT_SETTINGS } from "../src/domain/layout"
import { readFile } from "node:fs/promises"
import { sign } from "node:crypto"
import { expect, request, test, type APIRequestContext } from "@playwright/test"

const baseURL = process.env.SAKEKEEP_E2E_AUTH_BASE_URL!
function token(userId: string) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url")
  const now = Math.floor(Date.now() / 1000)
  const input = `${encode({ alg: "RS256", typ: "JWT", kid: "sakekeep-e2e" })}.${encode({ sub: userId, sid: `sess_${userId}`, azp: baseURL, exp: now + 3600, iat: now, nbf: now - 1 })}`
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), process.env.SAKEKEEP_E2E_CLERK_PRIVATE_KEY!).toString("base64url")}`
}
async function account(userId: string) {
  return request.newContext({
    baseURL,
    extraHTTPHeaders: { Authorization: `Bearer ${token(userId)}`, "Accept-Language": "en" },
  })
}
async function deliveredToken(email: string) {
  const fixtureURL = new URL(baseURL)
  fixtureURL.port = String(Number(fixtureURL.port) + 1)
  const response = await fetch(`${fixtureURL.origin}/test/invitations`)
  const invitations: Array<{ email_address: string; redirect_url: string }> = await response.json()
  return new URL(
    invitations.filter((invite) => invite.email_address === email).at(-1)!.redirect_url
  ).pathname
    .split("/")
    .at(-1)!
}
async function invite(
  owner: APIRequestContext,
  projectId: string,
  userId: string,
  role: "organizer" | "editor"
) {
  expect(
    (
      await owner.post(`/api/projects/${projectId}/collaborators`, {
        data: { action: "invite", email: `${userId}@example.com`, role },
      })
    ).status()
  ).toBe(204)
  return deliveredToken(`${userId}@example.com`)
}

test("separate Clerk accounts enforce privacy, roles, invitations, and ownership end to end", async () => {
  test.setTimeout(120_000)
  const owner = await account("user_owner")
  const editor = await account("user_editor")
  const organizer = await account("user_organizer")
  const stranger = await account("user_stranger")
  const unverified = await account("user_unverified")
  let id: string | undefined
  try {
    const create = await owner.post("/api/projects", { data: { title: "Private account test" } })
    expect(create.status()).toBe(201)
    id = (await create.json()).id
    const path = `/api/projects/${id}`
    expect((await owner.get(`${path}/collaborators`)).status()).toBe(200)
    expect(
      (await (await stranger.get("/api/projects")).json()).projects.map((p: { id: string }) => p.id)
    ).not.toContain(id)
    for (const [method, suffix] of [
      ["GET", ""],
      ["PATCH", ""],
      ["DELETE", ""],
      ["POST", "/publish"],
      ["POST", "/close"],
      ["POST", "/archive"],
      ["POST", "/unarchive"],
      ["POST", "/duplicate"],
      ["POST", "/assets"],
      ["POST", "/layouts"],
      ["POST", "/book"],
      ["PATCH", "/book"],
      ["POST", "/export"],
      ["GET", "/collaborators"],
      ["POST", "/collaborators"],
    ]) {
      for (const url of [`${path}${suffix}`, `/API/Projects/${id}${suffix.toUpperCase()}`]) {
        expect((await stranger.fetch(url, { method })).status(), `${method} ${url}`).toBe(404)
      }
    }
    for (const pagePath of [`/projects/${id}`, `/Projects/${id}`]) {
      const deniedPage = await stranger.get(pagePath, { maxRedirects: 0 })
      expect(deniedPage.status()).toBe(307)
      expect(deniedPage.headers().location).toBe("/projects")
    }
    expect((await owner.get(`/API/Projects/${id}`)).status()).toBe(200)
    const editorToken = await invite(owner, id!, "user_editor", "editor")
    expect((await stranger.post(`/api/invitations/${editorToken}`)).status()).toBe(403)
    expect((await editor.post(`/api/invitations/${editorToken}`)).status()).toBe(200)
    expect((await editor.post(`/api/invitations/${editorToken}`)).status()).toBe(200)
    const orgToken = await invite(owner, id!, "user_organizer", "organizer")
    expect((await organizer.post(`/api/invitations/${orgToken}`)).status()).toBe(200)
    const badToken = await invite(owner, id!, "user_unverified", "editor")
    expect((await unverified.post(`/api/invitations/${badToken}`)).status()).toBe(403)
    expect((await editor.patch(path, { data: { title: "Forbidden" } })).status()).toBe(403)
    expect((await editor.post(`${path}/publish`)).status()).toBe(403)
    expect((await editor.post(`/API/Projects/${id}/PUBLISH`)).status()).toBe(403)
    expect((await editor.delete(`/API/Projects/${id}`)).status()).toBe(403)
    expect((await editor.post(`${path}/archive`)).status()).toBe(403)
    expect(
      (
        await editor.post(`${path}/collaborators`, {
          data: { action: "invite", email: "x@example.com", role: "editor" },
        })
      ).status()
    ).toBe(403)
    expect((await editor.delete(path)).status()).toBe(403)
    expect(
      (await organizer.patch(path, { data: { title: "Renamed by organizer" } })).status()
    ).toBe(200)
    expect((await organizer.delete(path)).status()).toBe(403)
    expect(
      (
        await organizer.post(`${path}/collaborators`, {
          data: { action: "transfer", userId: "user_editor" },
        })
      ).status()
    ).toBe(403)
    expect(
      (
        await owner.patch(path, {
          data: {
            expectedRevision: 0,
            formSchema: {
              version: 1,
              questions: [
                {
                  id: "name",
                  type: "single-line",
                  prompt: "Name",
                  required: true,
                  characterLimit: 60,
                  validateUrl: false,
                },
              ],
            },
          },
        })
      ).status()
    ).toBe(200)
    const published = await owner.post(`${path}/publish`)
    expect(published.status()).toBe(200)
    const share = new URL((await published.json()).shareUrl).pathname.split("/").at(-1)
    const anonymous = await request.newContext({ baseURL })
    expect(
      (
        await anonymous.post(`/api/share/${share}`, {
          multipart: {
            payload: JSON.stringify({
              idempotencyKey: crypto.randomUUID(),
              answers: { name: "Anonymous contributor" },
            }),
          },
        })
      ).status()
    ).toBe(201)
    await anonymous.dispose()
    expect((await owner.post(`${path}/close`)).status()).toBe(200)
    const layout = await editor.post(`${path}/layouts`, {
      data: { action: "create", name: "Editor layout" },
    })
    expect(layout.status()).toBe(201)
    const layoutRecord = await layout.json()
    const layoutId = layoutRecord.id
    expect(
      (
        await editor.patch(`${path}/layouts/${layoutId}`, {
          data: {
            expectedRevision: 0,
            schema: {
              ...layoutRecord.schema,
              elements: [
                {
                  id: "text",
                  type: "static-text",
                  content: "A private book",
                  opacity: 1,
                  geometry: { x: 10, y: 10, width: 150, height: 50, rotation: 0 },
                  text: DEFAULT_TEXT_SETTINGS,
                },
              ],
            },
          },
        })
      ).status()
    ).toBe(200)
    const upload = await editor.post(`${path}/assets`, {
      multipart: {
        file: {
          name: "photo.png",
          mimeType: "image/png",
          buffer: await readFile("public/logo512.png"),
        },
      },
    })
    expect(upload.status()).toBe(201)
    const assetId = (await upload.json()).id
    for (const variant of ["master", "preview"]) {
      for (const resource of ["assets", "Assets"]) {
        expect(
          (await stranger.get(`/api/${resource}/${assetId}?variant=${variant}`)).status()
        ).toBe(404)
      }
      const image = await editor.get(`/api/assets/${assetId}?variant=${variant}`)
      expect(image.status()).toBe(200)
      expect(image.headers()["cache-control"]).toContain("no-store")
    }
    const other = await stranger.post("/api/projects", { data: { title: "Another private book" } })
    expect(other.status()).toBe(201)
    const otherId = (await other.json()).id
    expect(otherId).toBeTruthy()
    try {
      // Direct nested resource requests cannot change the asset's project.
      expect(
        (
          await stranger.patch(`/api/projects/${otherId}/assets/${assetId}`, {
            data: { focalPoint: null },
          })
        ).status()
      ).toBe(404)
    } finally {
      await stranger.delete(`/api/projects/${otherId}`)
    }
    expect(
      (
        await editor.post(`${path}/book`, {
          data: { mode: "cycle", seed: "private", manualAssignments: {}, resolutionOverrides: [] },
        })
      ).status()
    ).toBe(200)
    const exported = await editor.post(`${path}/export`, { data: {} })
    expect(exported.status()).toBe(201)
    const exportId = (await exported.json()).id
    for (const file of ["pdf", "report", "page-pdfs", "page-jpegs"]) {
      for (const resource of ["exports", "Exports"]) {
        expect((await stranger.get(`/api/${resource}/${exportId}?file=${file}`)).status()).toBe(404)
      }
      expect((await editor.get(`/api/exports/${exportId}?file=${file}`)).status()).toBe(200)
    }
    expect((await stranger.delete(`${path}/layouts/${layoutId}`)).status()).toBe(404)
    expect((await editor.delete(`${path}/layouts/${layoutId}`)).status()).toBe(204)
    expect(
      (
        await owner.post(`${path}/collaborators`, {
          data: { action: "transfer", userId: "user_editor" },
        })
      ).status()
    ).toBe(204)
    expect((await owner.delete(path)).status()).toBe(403)
    expect((await (await editor.get(`${path}/collaborators`)).json()).role).toBe("owner")
    expect(
      (
        await editor.post(`${path}/collaborators`, {
          data: { action: "change", userId: "user_organizer", role: null },
        })
      ).status()
    ).toBe(204)
    expect((await organizer.get(path)).status()).toBe(404)
    expect((await organizer.get(`/api/assets/${assetId}`)).status()).toBe(404)
    expect((await organizer.get(`/api/exports/${exportId}`)).status()).toBe(404)
    expect((await organizer.post(`/api/invitations/${orgToken}`)).status()).toBe(410)
    expect(
      (
        await editor.post(`${path}/collaborators`, {
          data: { action: "transfer", userId: "user_owner" },
        })
      ).status()
    ).toBe(204)
  } finally {
    if (id) await owner.delete(`/api/projects/${id}`)
    await Promise.all(
      [owner, editor, organizer, stranger, unverified].map((context) => context.dispose())
    )
  }
})

test("a new account starts in project creation and editor controls stay limited", async ({
  page,
}) => {
  // Account state fixture in the real demo shell; auth and role enforcement are tested above.
  await page.route("**/api/projects", async (route) => {
    if (route.request().method() === "GET") await route.fulfill({ json: { projects: [] } })
    else await route.continue()
  })
  await page.goto("/projects")
  await expect(page.getByTestId("heading-create-a-friend-book")).toBeVisible()
  await page.keyboard.press("Escape")
  await page.route("**/collaborators", (route) =>
    route.fulfill({
      json: { role: "editor", ownerUserId: "someone-else", members: [], invitations: [] },
    })
  )
  await page.goto("/projects/11111111-1111-4111-8111-111111111111?tab=form")
  await expect(page.getByTestId("workspace-responses")).toHaveAttribute("aria-selected", "true")
  await expect(page.getByTestId("workspace-form")).toHaveCount(0)
  await expect(page.getByTestId("button-delete-project")).toHaveCount(0)
  await expect(page.getByTestId("button-rename-project")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Collaborators", exact: true })).toHaveCount(0)
  await page.goto("/projects/22222222-2222-4222-8222-222222222222?tab=responses")
  await expect(page.getByTestId("workspace-responses")).toHaveAttribute("aria-selected", "true")
  await expect(page.getByTestId("button-lock-collection")).toHaveCount(0)
})
