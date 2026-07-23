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

async function canvasPixelAt(page: Page, xMm: number, yMm: number) {
  return page.getByLabel("Visual DIN A5 landscape layout canvas").evaluate(
    (canvas, point) => {
      const element = canvas as HTMLCanvasElement
      const bounds = element.getBoundingClientRect()
      const cssScale = bounds.width / 216
      const pixelScale = element.width / bounds.width
      const context = element.getContext("2d")
      if (!context) throw new Error("Canvas context unavailable.")
      return Array.from(
        context.getImageData(
          Math.round((point.xMm + 3) * cssScale * pixelScale),
          Math.round((point.yMm + 3) * cssScale * pixelScale),
          1,
          1
        ).data
      )
    },
    { xMm, yMm }
  )
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
      "Answer text",
      "Static text",
      "Image",
      "Gallery",
      "Add rectangle",
      "Add circle",
      "Add line",
    ]) {
      await expect(page.getByRole("button", { name })).toBeVisible()
    }
    await page
      .getByRole("button", { name: "Which memory still makes you smile?", exact: true })
      .click()
    await expect(page.getByText("Question binding")).toBeVisible()
    await expect(page.getByText("Font family")).toBeVisible()
    await page.screenshot({
      path: resolve(screenshots, "layout-editor-tablet.png"),
      fullPage: true,
    })
    await expectAccessible(page)
  })

  test("layer dragging controls canvas order, history, cancellation, and persistence", async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000)
    const created = await request.post(`/api/projects/${closedProjectId}/duplicate`)
    const projectId = ((await created.json()) as { id: string }).id
    await request.post(`/api/projects/${projectId}/publish`)
    await request.post(`/api/projects/${projectId}/close`)

    try {
      await page.setViewportSize({ width: 1365, height: 900 })
      await page.goto(`/projects/${projectId}?tab=layouts`)
      await expect(page.getByRole("heading", { name: "Page layouts" })).toBeVisible()

      await page.getByRole("button", { name: "Rectangle", exact: true }).click()
      for (const [label, value] of [
        ["X (mm)", "20"],
        ["Y (mm)", "20"],
        ["Width", "50"],
        ["Height", "50"],
      ] as const) {
        await page.getByRole("spinbutton", { name: label, exact: true }).fill(value)
      }
      await page.getByLabel("Fill colour").fill("#ef4444")

      await page.getByRole("button", { name: "Add circle" }).click()
      for (const [label, value] of [
        ["X (mm)", "20"],
        ["Y (mm)", "20"],
        ["Width", "50"],
        ["Height", "50"],
      ] as const) {
        await page.getByRole("spinbutton", { name: label, exact: true }).fill(value)
      }
      await page.getByLabel("Fill colour").fill("#3b82f6")
      await expect(page.getByRole("status")).toContainText("Saved", { timeout: 10_000 })
      await expect
        .poll(async () => {
          const [red, , blue] = await canvasPixelAt(page, 30, 30)
          return blue! > red!
        })
        .toBe(true)

      const rectangleHandle = page.getByRole("button", { name: "Drag Rectangle layer" })
      const rectangleRow = page.locator('[data-layer-row="Rectangle"]')
      const circleRow = page.locator('[data-layer-row="Circle"]')
      const dataTransfer = await page.evaluateHandle(() => new DataTransfer())
      await rectangleHandle.dispatchEvent("dragstart", { dataTransfer })
      const circleBounds = await circleRow.boundingBox()
      if (!circleBounds) throw new Error("Circle layer row is not visible.")
      await circleRow.dispatchEvent("dragover", {
        dataTransfer,
        clientY: circleBounds.y + 1,
      })
      await expect(rectangleRow).toHaveAttribute("data-dragging", "true")
      await expect(circleRow).toHaveAttribute("data-drop-edge", "before")
      await rectangleHandle.dispatchEvent("dragend", { dataTransfer })
      await expect(rectangleRow).not.toHaveAttribute("data-dragging")
      await expect(circleRow).not.toHaveAttribute("data-drop-edge")
      await expect
        .poll(async () => {
          const [red, , blue] = await canvasPixelAt(page, 30, 30)
          return blue! > red!
        })
        .toBe(true)

      await rectangleHandle.dragTo(circleRow, {
        targetPosition: { x: 30, y: 2 },
      })
      await expect(page.locator("[data-layer-row]").first()).toHaveAttribute(
        "data-layer-row",
        "Rectangle"
      )
      await expect(page.getByText("rectangle", { exact: true })).toBeVisible()
      await expect
        .poll(async () => {
          const [red, , blue] = await canvasPixelAt(page, 30, 30)
          return red! > blue!
        })
        .toBe(true)
      await expect(page.getByRole("status")).toContainText("Saved", { timeout: 10_000 })

      await page.getByRole("button", { name: "Undo" }).click()
      await expect
        .poll(async () => {
          const [red, , blue] = await canvasPixelAt(page, 30, 30)
          return blue! > red!
        })
        .toBe(true)
      await page.getByRole("button", { name: "Redo" }).click()
      await expect
        .poll(async () => {
          const [red, , blue] = await canvasPixelAt(page, 30, 30)
          return red! > blue!
        })
        .toBe(true)
      await expect(page.getByRole("status")).toContainText("Saved", { timeout: 10_000 })

      await page.reload()
      await expect(page.locator("[data-layer-row]").first()).toHaveAttribute(
        "data-layer-row",
        "Rectangle"
      )
      await expect
        .poll(async () => {
          const [red, , blue] = await canvasPixelAt(page, 30, 30)
          return red! > blue!
        })
        .toBe(true)

      await page
        .getByRole("button", { name: "What should we call you in the book?", exact: true })
        .click()
      const bringForward = page.getByRole("button", { name: "Bring forward" })
      await bringForward.focus()
      await page.keyboard.press("Enter")
      await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled()
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
