import { resolve } from "node:path"

import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

import { shareTokenForProject } from "../src/server/share-token.ts"

const collectingProjectId = "22222222-2222-4222-8222-222222222222"
const collectingToken = shareTokenForProject(collectingProjectId)
const closedProjectId = "11111111-1111-4111-8111-111111111111"
const screenshots = resolve("visual-artifacts/screenshots")

async function expectAccessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()
  expect(
    result.violations,
    result.violations
      .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length})`)
      .join("\n")
  ).toEqual([])
}

test.describe.serial("critical local prototype workflows", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
  })

  test("public form is responsive, accessible, and recovers an image draft", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/s/${collectingToken}`)
    await expect(page.getByRole("heading", { name: "Mina’s 30th birthday" })).toBeVisible()
    await page.screenshot({
      path: resolve(screenshots, "public-form-mobile.png"),
      fullPage: true,
    })
    await expectAccessible(page)

    await page.getByLabel("What should we call you in the book?").fill("Playwright Nora")
    await page
      .getByLabel("Which memory still makes you smile?")
      .fill("A recovered draft with a local image.")
    await page.getByRole("radio", { name: "Making chaos feel calm" }).click()
    await page.getByRole("checkbox", { name: "A little travel" }).click()
    await page.locator('input[type="file"]').setInputFiles(resolve("public/logo512.png"))
    await expect(page.getByRole("button", { name: "Remove logo512.png" })).toBeVisible()
    await page.waitForTimeout(550)
    await page.reload()

    await expect(page.getByText("Draft restored")).toBeVisible()
    await expect(page.getByLabel("What should we call you in the book?")).toHaveValue(
      "Playwright Nora"
    )
    await expect(page.getByRole("radio", { name: "Making chaos feel calm" })).toBeChecked()
    await expect(page.getByRole("checkbox", { name: "A little travel" })).toBeChecked()
    await expect(page.getByRole("button", { name: "Remove logo512.png" })).toBeVisible()

    await page.getByRole("button", { name: "Submit once" }).click()
    await expect(page.getByText("Your response was submitted.")).toBeVisible()
    await page.screenshot({
      path: resolve(screenshots, "public-form-success-mobile.png"),
      fullPage: true,
    })
    await expectAccessible(page)
  })

  test("public form has a usable desktop presentation", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/s/${collectingToken}`)
    await expect(page.getByRole("button", { name: "Submit once" })).toBeVisible()
    await page.screenshot({
      path: resolve(screenshots, "public-form-desktop.png"),
      fullPage: true,
    })
    await expectAccessible(page)
  })

  test("organizer creates, autosaves, reorders, and publishes every question type", async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000)
    await page.setViewportSize({ width: 1365, height: 900 })
    await page.goto("/projects")
    await expect(page.getByText("Lea’s farewell book")).toBeVisible()
    await page.getByRole("button", { name: "New project" }).click()
    await expect(page.getByRole("heading", { name: "Create a friend book" })).toBeVisible()
    await page.getByLabel("Project name").fill("Playwright complete workflow")
    await page.getByLabel("Occasion (optional)").fill("Acceptance verification")
    const createdResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/projects") && response.request().method() === "POST"
    )
    await page.getByRole("button", { name: "Create project" }).click()
    const projectId = ((await (await createdResponse).json()) as { id: string }).id
    await page.waitForURL(`/projects/${projectId}`)

    try {
      await expect(page.getByRole("heading", { name: "Build the questionnaire" })).toBeVisible({
        timeout: 15_000,
      })
      const prompts = [
        ["Single-line text", "Your name"],
        ["Multiline text", "Share a memory"],
        ["Radio buttons", "Choose one"],
        ["Checkboxes", "Choose any"],
        ["Image upload", "Add photos"],
      ] as const
      for (const [type, prompt] of prompts) {
        await page.getByRole("combobox").first().click()
        await page.getByRole("option", { name: type }).click()
        await page.getByRole("button", { name: `Add ${type.toLowerCase()}` }).click()
        await page.getByLabel("Question").last().fill(prompt)
      }
      await expect(page.getByRole("status")).toContainText("Saved", {
        timeout: 10_000,
      })
      await page.getByRole("button", { name: "Move question up" }).last().click()
      await expect(page.getByRole("status")).toContainText("Saved", {
        timeout: 10_000,
      })
      await page.screenshot({
        path: resolve(screenshots, "form-builder-desktop.png"),
        fullPage: true,
      })
      await expectAccessible(page)

      await page.getByRole("button", { name: "Publish and create share link" }).click()
      await expect(
        page.getByRole("heading", { name: "Publish this form permanently?" })
      ).toBeVisible()
      await page.getByRole("button", { name: "Publish forever" }).click()
      await expect(page.getByRole("heading", { name: "Published form" })).toBeVisible()
      await expect(page.getByText("collecting", { exact: true })).toBeVisible()
      await expect(page.getByText("This revision is permanently frozen.")).toBeVisible()
    } finally {
      await request.delete(`/api/projects/${projectId}`)
    }
  })

  test("layout editor works at tablet size and canonical tools are present", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.goto(`/projects/${closedProjectId}`)
    await page.getByRole("tab", { name: "3. Layouts" }).click()
    await expect(page.getByRole("heading", { name: "Page layouts" })).toBeVisible()
    const layoutSelect = page.getByRole("combobox", { name: "Choose a layout" })
    await expect(layoutSelect).toContainText("Warm quote")
    await layoutSelect.click()
    await page.getByRole("option", { name: "Playful note" }).click()
    await expect(layoutSelect).toContainText("Playful note")
    await expect(page.getByLabel("Layout name")).toHaveValue("Playful note")
    await expect(page.getByLabel("Visual DIN A5 landscape layout canvas")).toBeVisible()
    for (const name of [
      "Add text for What should we call you in the book?",
      "Add text for Which memory still makes you smile?",
      "Add text for What is Lea’s secret superpower?",
      "Add text for What should the next chapter include?",
      "Add image for Add one or two favourite photos",
      "Add gallery for Add one or two favourite photos",
      "Static text",
      "Add rectangle",
      "Add circle",
      "Add line",
    ]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible()
    }
    await expect(page.getByRole("button", { name: "Answer text", exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Image", exact: true })).toHaveCount(0)
    await page
      .getByRole("button", { name: "Which memory still makes you smile?", exact: true })
      .click()
    await expect(page.getByText("Question binding")).toBeVisible()
    await expect(page.getByLabel("Question binding")).toHaveText(
      "Which memory still makes you smile?"
    )
    await expect(page.getByRole("combobox", { name: "Question binding" })).toHaveCount(0)
    await expect(page.getByText("Font family")).toBeVisible()
    await page.screenshot({
      path: resolve(screenshots, "layout-editor-tablet.png"),
      fullPage: true,
    })
    await expectAccessible(page)
  })

  test("question palette inserts exact read-only bindings and keeps static text editable", async ({
    page,
    request,
  }) => {
    const created = await request.post(`/api/projects/${closedProjectId}/duplicate`)
    const projectId = ((await created.json()) as { id: string }).id
    await request.post(`/api/projects/${projectId}/publish`)
    await request.post(`/api/projects/${projectId}/close`)

    const latestElement = async () => {
      const response = await request.get(`/api/projects/${projectId}`)
      const project = (await response.json()) as {
        layouts: Array<{
          name: string
          schema: { elements: Array<{ type: string; questionId?: string; content?: string }> }
        }>
      }
      return project.layouts.find((layout) => layout.name === "Warm quote")!.schema.elements.at(-1)
    }

    try {
      await page.setViewportSize({ width: 1365, height: 900 })
      await page.goto(`/projects/${projectId}?tab=layouts`)

      const addMemory = page.getByRole("button", {
        name: "Add text for Which memory still makes you smile?",
      })
      await addMemory.focus()
      await page.keyboard.press("Enter")
      await expect(page.getByLabel("Question binding")).toHaveText(
        "Which memory still makes you smile?"
      )
      await expect(page.getByRole("combobox", { name: "Question binding" })).toHaveCount(0)
      await expect(page.getByRole("status")).toContainText("Saved", { timeout: 10_000 })
      expect(await latestElement()).toMatchObject({ type: "bound-text", questionId: "memory" })

      const upperCanvas = page.locator("canvas.upper-canvas")
      await upperCanvas.dblclick({ position: { x: 100, y: 80 } })
      expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("TEXTAREA")

      await page
        .getByRole("button", { name: "Add image for Add one or two favourite photos" })
        .click()
      await expect(page.getByLabel("Question binding")).toHaveText(
        "Add one or two favourite photos"
      )
      await expect(page.getByRole("status")).toContainText("Saved", { timeout: 10_000 })
      expect(await latestElement()).toMatchObject({ type: "image-frame", questionId: "photos" })

      await page
        .getByRole("button", { name: "Add gallery for Add one or two favourite photos" })
        .click()
      await expect(page.getByLabel("Question binding")).toHaveText(
        "Add one or two favourite photos"
      )
      await expect(page.getByRole("status")).toContainText("Saved", { timeout: 10_000 })
      expect(await latestElement()).toMatchObject({ type: "gallery-frame", questionId: "photos" })

      await page.getByRole("button", { name: "Static text", exact: true }).click()
      await expect(page.getByLabel("Content")).toBeEditable()
      await page.getByLabel("Content").fill("An editable static note")
      await expect(page.getByRole("status")).toContainText("Saved", { timeout: 10_000 })

      await upperCanvas.dblclick({ position: { x: 100, y: 80 } })
      await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe("TEXTAREA")
      await page.keyboard.press("Control+a")
      await page.keyboard.type("Canvas-edited static note")
      await page.keyboard.press("Escape")
      await page.getByLabel("Layout name").click()
      await expect(page.getByLabel("Content")).toHaveValue("Canvas-edited static note")
      await expect(page.getByRole("status")).toContainText("Saved", { timeout: 10_000 })
      expect(await latestElement()).toMatchObject({
        type: "static-text",
        content: "Canvas-edited static note",
      })
    } finally {
      await request.delete(`/api/projects/${projectId}`)
    }
  })

  test("workspace tabs persist in the URL and browser history", async ({ page }) => {
    await page.goto(`/projects/${closedProjectId}?tab=layouts&source=bookmark`)
    await expect(page.getByRole("tab", { name: "3. Layouts" })).toHaveAttribute(
      "aria-selected",
      "true"
    )

    await page.getByRole("tab", { name: "4. Book review" }).click()
    await expect(page).toHaveURL(/tab=book/)
    await expect(page).toHaveURL(/source=bookmark/)
    await page.reload()
    await expect(page.getByRole("tab", { name: "4. Book review" })).toHaveAttribute(
      "aria-selected",
      "true"
    )

    await page.goBack()
    await expect(page.getByRole("tab", { name: "3. Layouts" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    await page.goForward()
    await expect(page.getByRole("tab", { name: "4. Book review" })).toHaveAttribute(
      "aria-selected",
      "true"
    )

    await page.goto(`/projects/${closedProjectId}?tab=unknown`)
    await expect(page.getByRole("tab", { name: "5. Export" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  })

  test("organizer reviews a current book and exports a verified PDF", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/projects/${closedProjectId}`)
    await page.getByRole("tab", { name: "4. Book review" }).click()
    await expect(page.getByText("0 blocking · 0 warnings")).toBeVisible()
    await expect(page.getByRole("combobox", { name: "Page layout" })).toContainText("Warm quote")
    await page.screenshot({
      path: resolve(screenshots, "generated-book-desktop.png"),
      fullPage: true,
    })
    await expectAccessible(page)

    await page.getByRole("tab", { name: "5. Export" }).click()
    const exportResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/${closedProjectId}/export`) &&
        response.request().method() === "POST"
    )
    await page.getByRole("button", { name: "Export PDF + report" }).click()
    expect((await exportResponse).status()).toBe(201)
    await expect(page.getByText("Export complete")).toBeVisible()
    await expect(page.getByRole("link", { name: "Download PDF" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Download report" })).toBeVisible()
    await expectAccessible(page)
  })
})
