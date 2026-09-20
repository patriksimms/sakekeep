import { expect, request, test, type APIRequestContext } from "@playwright/test"
import { readFile, writeFile } from "node:fs/promises"

import { type ImageAnswer, type Project } from "../src/domain/types"
import { shareTokenForProject } from "../src/server/share-token"

test.skip(process.env.PRODUCTION_SMOKE !== "true", "Run through bun run smoke:production.")

const collectingProjectId = "22222222-2222-4222-8222-222222222222"
const exportProjectId = "11111111-1111-4111-8111-111111111111"
const submissionMarker = "The production container preserved an uploaded image."
const statePath = process.env.PRODUCTION_SMOKE_STATE_PATH
if (process.env.PRODUCTION_SMOKE === "true" && !statePath) {
  throw new Error("PRODUCTION_SMOKE_STATE_PATH is required.")
}

/**
 * The organizer's signed-in state, as the shipped image sees it. Both phases build it the same
 * way from the same session token, so recreating the container does not lose the sign-in: the
 * verify phase is authenticated exactly like the create phase was.
 */
async function organizer(): Promise<APIRequestContext> {
  const token = process.env.PRODUCTION_SMOKE_AUTH_TOKEN
  if (!token) throw new Error("PRODUCTION_SMOKE_AUTH_TOKEN is required.")
  return request.newContext({
    baseURL: process.env.PRODUCTION_SMOKE_ORIGIN,
    extraHTTPHeaders: { Authorization: `Bearer ${token}`, "Accept-Language": "en" },
  })
}

async function expectHealthy(api: APIRequestContext) {
  const health = await api.get("/api/health")
  expect(health.ok()).toBe(true)
  await expect(health.json()).resolves.toMatchObject({
    status: "ok",
    checks: { database: { status: "ok" }, objectStore: { status: "ok" } },
  })
}

test("creates persistent production data before app recreation", async ({ page }) => {
  test.skip(process.env.PRODUCTION_SMOKE_PHASE !== "create", "Only run during the create phase.")
  test.setTimeout(180_000)
  const api = await organizer()

  // The organizer's own projects are only visible to a signed-in account.
  const projects = await api.get("/api/projects")
  expect(projects.ok()).toBe(true)
  await expect(projects.json()).resolves.toMatchObject({
    projects: expect.arrayContaining([expect.objectContaining({ title: "Lea’s farewell book" })]),
  })

  const collectingToken = shareTokenForProject(collectingProjectId)
  await page.goto(`/s/${collectingToken}`)
  await page.getByTestId("answer-name").fill("Production smoke")
  await page.getByTestId("answer-memory").fill(submissionMarker)
  await page.getByRole("radio", { name: "Making chaos feel calm" }).click()
  await page.getByRole("checkbox", { name: "A little travel" }).click()
  await page.locator('input[type="file"]').setInputFiles("public/logo512.png")
  // Consent is required, and without it the submit button stays disabled.
  await page.getByTestId("contribution-consent").click()
  const submit = page.getByTestId("submit-contribution")
  await expect(submit).toBeEnabled()
  await submit.click()
  await expect(page.getByText("Your response was submitted.")).toBeVisible()

  await expectHealthy(api)

  const exportResponse = await api.post(`/api/projects/${exportProjectId}/export`, { data: {} })
  expect(exportResponse.ok()).toBe(true)
  const { id } = (await exportResponse.json()) as { id: string }
  const download = await api.get(`/api/exports/${id}`)
  expect(download.ok()).toBe(true)
  expect(download.headers()["content-type"]).toContain("application/pdf")
  expect((await download.body()).byteLength).toBeGreaterThan(0)
  await writeFile(statePath!, JSON.stringify({ exportId: id }))
})

test("retrieves production data after app recreation", async () => {
  test.skip(process.env.PRODUCTION_SMOKE_PHASE !== "verify", "Only run during the verify phase.")
  test.setTimeout(180_000)
  const api = await organizer()

  await expectHealthy(api)

  const projectResponse = await api.get(`/api/projects/${collectingProjectId}?submissions=true`)
  expect(projectResponse.ok()).toBe(true)
  const project = (await projectResponse.json()) as Project
  const submission = project.submissions?.find((candidate) =>
    Object.values(candidate.answers).some((answer) => answer === submissionMarker)
  )
  expect(submission).toBeDefined()

  const image = Object.values(submission!.answers)
    .flat()
    .find(
      (answer): answer is ImageAnswer =>
        typeof answer === "object" && answer !== null && "assetId" in answer
    )
  expect(image?.previewUrl).toBeTruthy()
  expect(image?.masterUrl).toBeTruthy()
  expect((await api.get(image!.previewUrl!)).ok()).toBe(true)
  expect((await api.get(image!.masterUrl!)).ok()).toBe(true)

  const { exportId } = JSON.parse(await readFile(statePath!, "utf8")) as { exportId: string }
  const download = await api.get(`/api/exports/${exportId}`)
  expect(download.ok()).toBe(true)
  expect(download.headers()["content-type"]).toContain("application/pdf")
  expect((await download.body()).byteLength).toBeGreaterThan(0)
})
