import { expect, test } from "@playwright/test"

import { shareTokenForProject } from "../src/server/share-token"

test.skip(process.env.PRODUCTION_SMOKE !== "true", "Run through bun run smoke:production.")

test("serves the authenticated organizer and anonymous share journeys", async ({
  page,
  request,
}) => {
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

  const collectingToken = shareTokenForProject("22222222-2222-4222-8222-222222222222")
  const publicResponse = await request.get(`/s/${collectingToken}`)
  expect(publicResponse.ok()).toBe(true)

  const publicPage = await page.context().browser()!.newPage()
  await publicPage.goto(`/s/${collectingToken}`)
  await publicPage.getByLabel("What should we call you in the book?").fill("Production smoke")
  await publicPage
    .getByLabel("Which memory still makes you smile?")
    .fill("The production container preserved an uploaded image.")
  await publicPage.getByRole("radio", { name: "Making chaos feel calm" }).click()
  await publicPage.getByRole("checkbox", { name: "A little travel" }).click()
  await publicPage.locator('input[type="file"]').setInputFiles("public/logo512.png")
  await publicPage.getByRole("button", { name: "Submit once" }).click()
  await expect(publicPage.getByText("Your response was submitted.")).toBeVisible()

  const health = await request.get("/api/health")
  expect(health.ok()).toBe(true)
  await expect(health.json()).resolves.toMatchObject({
    status: "ok",
    checks: { database: { status: "ok" }, objectStore: { status: "ok" } },
  })

  const exportResponse = await request.post(
    "/api/projects/11111111-1111-4111-8111-111111111111/export",
    { data: {} }
  )
  expect(exportResponse.ok()).toBe(true)
  const { id } = (await exportResponse.json()) as { id: string }
  const download = await request.get(`/api/exports/${id}`)
  expect(download.ok()).toBe(true)
  expect(download.headers()["content-type"]).toContain("application/pdf")
})
