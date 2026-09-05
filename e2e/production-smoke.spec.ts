import { expect, test } from "@playwright/test"
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

test("creates persistent production data before app recreation", async ({ page, request }) => {
  test.skip(process.env.PRODUCTION_SMOKE_PHASE !== "create", "Only run during the create phase.")
  test.setTimeout(120_000)
  const email = process.env.CLERK_TEST_USER_EMAIL
  const password = process.env.CLERK_TEST_USER_PASSWORD
  if (!email || !password) throw new Error("Clerk smoke-test user credentials are required.")

  await page.goto("/sign-in")
  await page.getByLabel(/email address/i).fill(email)
  await page.getByRole("button", { name: /continue/i }).click()
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole("button", { name: /continue/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"))
  await page.goto("/projects")
  await expect(page.getByText("Lea’s farewell book")).toBeVisible()

  const collectingToken = shareTokenForProject(collectingProjectId)
  const publicResponse = await request.get(`/s/${collectingToken}`)
  expect(publicResponse.ok()).toBe(true)

  const publicPage = await page.context().browser()!.newPage()
  await publicPage.goto(`/s/${collectingToken}`)
  await publicPage.getByTestId("answer-name").fill("Production smoke")
  await publicPage.getByTestId("answer-memory").fill(submissionMarker)
  await publicPage.getByRole("radio", { name: "Making chaos feel calm" }).click()
  await publicPage.getByRole("checkbox", { name: "A little travel" }).click()
  await publicPage.locator('input[type="file"]').setInputFiles("public/logo512.png")
  await publicPage.getByTestId("submit-contribution").click()
  await expect(publicPage.getByText("Your response was submitted.")).toBeVisible()

  const health = await request.get("/api/health")
  expect(health.ok()).toBe(true)
  await expect(health.json()).resolves.toMatchObject({
    status: "ok",
    checks: { database: { status: "ok" }, objectStore: { status: "ok" } },
  })

  const exportResponse = await request.post(`/api/projects/${exportProjectId}/export`, { data: {} })
  expect(exportResponse.ok()).toBe(true)
  const { id } = (await exportResponse.json()) as { id: string }
  const download = await request.get(`/api/exports/${id}`)
  expect(download.ok()).toBe(true)
  expect(download.headers()["content-type"]).toContain("application/pdf")
  await writeFile(statePath!, JSON.stringify({ exportId: id }))
})

test("retrieves production data after app recreation", async ({ request }) => {
  test.skip(process.env.PRODUCTION_SMOKE_PHASE !== "verify", "Only run during the verify phase.")
  test.setTimeout(120_000)

  const health = await request.get("/api/health")
  expect(health.ok()).toBe(true)
  await expect(health.json()).resolves.toMatchObject({
    status: "ok",
    checks: { database: { status: "ok" }, objectStore: { status: "ok" } },
  })

  const projectResponse = await request.get(`/api/projects/${collectingProjectId}?submissions=true`)
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
  expect((await request.get(image!.previewUrl!)).ok()).toBe(true)
  expect((await request.get(image!.masterUrl!)).ok()).toBe(true)

  const { exportId } = JSON.parse(await readFile(statePath!, "utf8")) as { exportId: string }
  const download = await request.get(`/api/exports/${exportId}`)
  expect(download.ok()).toBe(true)
  expect(download.headers()["content-type"]).toContain("application/pdf")
})
