import { resolve } from "node:path"
import { expect, test, type APIRequestContext } from "@playwright/test"
import type { LayoutRecord, Project } from "../src/domain/types.ts"

const id = "11111111-1111-4111-8111-111111111111"
const api = `/api/projects/${id}`
const url = `/projects/${id}?tab=book`
const screenshots = resolve("visual-artifacts/issues/94")
const getProject = async (request: APIRequestContext) =>
  (await (await request.get(api)).json()) as Project

test.use({ colorScheme: "dark", viewport: { width: 1440, height: 1000 } })

test("stale direct links and reloads update read-only previews, with retry after failure", async ({
  page,
  request,
}) => {
  const original = await getProject(request)
  await request.patch(`${api}/book`, { data: {} })
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let attempts = 0
  await page.route(`**${api}/book`, async (route) => {
    if (route.request().method() !== "POST") return route.continue()
    attempts++
    if (attempts === 1) {
      await held
      return route.fulfill({
        status: 503,
        json: { error: "Generation is temporarily unavailable." },
      })
    }
    await route.continue()
  })
  try {
    await page.goto(url)
    await expect(page.getByText("Updating book", { exact: true })).toBeVisible()
    await expect(page.getByTestId("book-page-tile")).toHaveCount(3)
    await expect(page.getByRole("combobox", { name: "Assignment mode" })).toBeDisabled()
    await expect(page.getByRole("button", { name: "Regenerate complete book" })).toHaveCount(0)
    await page.screenshot({ path: resolve(screenshots, "after-updating.png") })
    await page.getByRole("button", { name: "Single page", exact: true }).click()
    await expect(page.getByRole("combobox", { name: "Page layout", exact: true })).toBeDisabled()
    await expect(page.getByRole("button", { name: "Move page 1 down" })).toBeDisabled()
    await page.getByRole("tab", { name: "5. Export" }).click()
    await expect(page.getByRole("button", { name: "Export book", exact: true })).toBeDisabled()
    await page.getByRole("tab", { name: "4. Book review" }).click()
    expect(attempts).toBe(1)
    release()
    await expect(page.getByText("Book update failed", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "All pages", exact: true }).click()
    await page.screenshot({ path: resolve(screenshots, "after-failed.png") })
    await page.getByRole("button", { name: "Retry", exact: true }).click()
    await expect(page.getByRole("combobox", { name: "Assignment mode" })).toBeEnabled()
    await expect(page.getByText("Book update failed", { exact: true })).toHaveCount(0)
    expect(attempts).toBe(2)
    await page.waitForTimeout(200) // Let the status badge finish its color transition.
    await page.screenshot({ path: resolve(screenshots, "after-current.png") })
    await request.patch(`${api}/book`, { data: {} })
    await page.reload()
    await expect.poll(() => attempts).toBe(3)
    await expect(page.getByRole("combobox", { name: "Assignment mode" })).toBeEnabled()
    expect((await getProject(request)).bookStatus).toBe("current")
  } finally {
    release()
    await request.post(`${api}/book`, { data: original.book!.settings })
  }
})

for (const failSave of [false, true]) {
  test(`entering review waits for layout saves${failSave ? " and recovers from a failed save" : ""}`, async ({
    page,
    request,
  }) => {
    const original = await getProject(request)
    const layout = original.layouts[0]!
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let saving = false
    let rejectSave = failSave
    let generations = 0
    await page.route(`**${api}/layouts/${layout.id}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue()
      saving = true
      await held
      if (rejectSave) {
        rejectSave = false
        return route.fulfill({ status: 503, json: { error: "Layout save unavailable" } })
      }
      await route.continue()
    })
    page.on("request", (request) => {
      if (request.url().endsWith(`${api}/book`) && request.method() === "POST") generations++
    })
    try {
      await page.goto(`/projects/${id}?tab=layouts`)
      await page
        .getByRole("textbox", { name: "Layout name", exact: true })
        .fill("Saved before regeneration")
      await page.getByRole("tab", { name: "4. Book review" }).click()
      await expect.poll(() => saving).toBe(true)
      await expect(page.getByText("Updating book", { exact: true })).toBeVisible()
      expect(generations).toBe(0)
      release()
      if (failSave) {
        await expect(page.getByText("Book update failed", { exact: true })).toBeVisible()
        expect(generations).toBe(0)
        await page.getByRole("tab", { name: "5. Export" }).click()
        await expect(page.getByRole("button", { name: "Export book", exact: true })).toBeDisabled()
        await page.getByRole("tab", { name: "4. Book review" }).click()
      }
      await expect(page.getByRole("combobox", { name: "Assignment mode" })).toBeEnabled()
      expect(generations).toBe(1)
      await expect(page.getByTestId("book-page-tile").first()).toContainText(
        "Saved before regeneration"
      )
      const saved = await getProject(request)
      expect(saved.bookStatus).toBe("current")
      expect(saved.layouts[0]!.name).toBe("Saved before regeneration")
    } finally {
      release()
      const latest = (await getProject(request)).layouts.find((item) => item.id === layout.id)!
      await request.patch(`${api}/layouts/${layout.id}`, {
        data: { expectedRevision: latest.revision, name: layout.name, schema: layout.schema },
      })
      await request.post(`${api}/book`, { data: original.book!.settings })
    }
  })
}

test("settings, assignments, page order and standalone pages rebuild after saving", async ({
  page,
  request,
}) => {
  const original = await getProject(request)
  const standalone = (await (
    await request.post(`${api}/layouts`, {
      data: { action: "create", name: "Interlude", role: "static" },
    })
  ).json()) as LayoutRecord
  const generatedSettings: Array<Project["book"]> = []
  page.on("response", async (response) => {
    if (
      response.url().endsWith(`${api}/book`) &&
      response.request().method() === "POST" &&
      response.ok()
    ) {
      generatedSettings.push(await response.json())
    }
  })
  const mode = page.getByRole("combobox", { name: "Assignment mode" })
  try {
    await page.goto(url)
    await expect(mode).toBeEnabled()
    await mode.click()
    await page.getByRole("option", { name: "Seeded random", exact: true }).click()
    await expect
      .poll(async () => (await getProject(request)).book!.settings.mode)
      .toBe("seeded-random")
    await expect(mode).toBeEnabled()
    const seed = page.getByRole("textbox", { name: "Random seed" })
    const count = generatedSettings.length
    await seed.fill("not yet committed")
    expect(generatedSettings).toHaveLength(count)
    await seed.fill("final seed")
    await seed.press("Enter")
    await expect
      .poll(async () => (await getProject(request)).book!.settings.seed)
      .toBe("final seed")
    await expect(mode).toBeEnabled()
    expect(generatedSettings.some((book) => book?.settings.seed === "not yet committed")).toBe(
      false
    )
    await mode.click()
    await page.getByRole("option", { name: "Manual assignments", exact: true }).click()
    await expect(mode).toBeEnabled()
    await page.getByRole("button", { name: "Single page", exact: true }).click()
    const pageLayout = page.getByRole("combobox", { name: "Page layout", exact: true })
    await pageLayout.click()
    await page.getByRole("option", { name: original.layouts[1]!.name, exact: true }).click()
    await expect(pageLayout).toBeEnabled()
    const assigned = await getProject(request)
    const firstPage = original.book!.pages[0]!
    if (firstPage.kind !== "submission") throw new Error("Expected a response page")
    expect(assigned.book!.settings.manualAssignments[firstPage.submissionId]).toBe(
      original.layouts[1]!.id
    )
    const firstId = assigned.book!.pages[0]!.id
    await page.getByRole("button", { name: "Move page 1 down" }).click()
    await expect.poll(async () => (await getProject(request)).book!.pages[1]!.id).toBe(firstId)
    await expect(mode).toBeEnabled()
    await page.getByRole("button", { name: "Standalone page", exact: true }).click()
    await page.getByRole("button", { name: "Add page", exact: true }).click()
    await expect.poll(async () => (await getProject(request)).book!.pages.length).toBe(4)
    await expect(mode).toBeEnabled()
    await page.getByRole("button", { name: "4. Standalone page: Interlude", exact: true }).click()
    await page.getByRole("button", { name: "Delete standalone page" }).click()
    await expect.poll(async () => (await getProject(request)).book!.pages.length).toBe(3)
    await expect(mode).toBeEnabled()
    expect((await getProject(request)).bookStatus).toBe("current")
  } finally {
    await request.delete(`${api}/layouts/${standalone.id}`)
    await request.patch(`${api}/book`, {
      data: { pages: original.book!.pages, settings: original.book!.settings },
    })
    await request.post(`${api}/book`, { data: original.book!.settings })
  }
})

for (const failAction of [false, true]) {
  test(`review waits for a layout operation${failAction ? " and handles rejection" : " already in flight"}`, async ({
    page,
    request,
  }) => {
    const original = await getProject(request)
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let started = false
    let generations = 0
    await page.route(`**${api}/layouts`, async (route) => {
      if (route.request().method() !== "POST") return route.continue()
      started = true
      await held
      if (failAction)
        return route.fulfill({ status: 503, json: { error: "Layout operation unavailable" } })
      await route.continue()
    })
    page.on("request", (request) => {
      if (request.url().endsWith(`${api}/book`) && request.method() === "POST") generations++
    })
    try {
      await page.goto(`/projects/${id}?tab=layouts`)
      await page.getByRole("button", { name: "Duplicate layout", exact: true }).click()
      await expect.poll(() => started).toBe(true)
      await page.getByRole("tab", { name: "4. Book review" }).click()
      await expect(page.getByText("Updating book", { exact: true })).toBeVisible()
      expect(generations).toBe(0)
      release()
      if (failAction) {
        await expect(
          page.getByText("Layout changes could not be saved.", { exact: false })
        ).toBeVisible()
        await expect(page.getByRole("combobox", { name: "Assignment mode" })).toBeDisabled()
        expect(generations).toBe(0)
        await page.getByRole("button", { name: "Retry", exact: true }).click()
      }
      await expect(page.getByRole("combobox", { name: "Assignment mode" })).toBeEnabled()
      expect(generations).toBe(1)
      const saved = await getProject(request)
      expect(saved.bookStatus).toBe("current")
      expect(saved.layouts).toHaveLength(original.layouts.length + (failAction ? 0 : 1))
    } finally {
      release()
      for (const layout of (await getProject(request)).layouts) {
        if (!original.layouts.some((item) => item.id === layout.id))
          await request.delete(`${api}/layouts/${layout.id}`)
      }
      await request.post(`${api}/book`, { data: original.book!.settings })
    }
  })
}
