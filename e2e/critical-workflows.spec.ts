import { resolve } from "node:path"

import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

import type { LayoutRecord, Project } from "../src/domain/types.ts"
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
    await expect(page.getByRole("checkbox", { name: /I agree that my answers/ })).not.toBeChecked()

    await expect(page.getByRole("button", { name: "Submit once" })).toBeDisabled()
    await page.getByRole("checkbox", { name: /I agree that my answers/ }).click()
    await expect(page.getByRole("button", { name: "Submit once" })).toBeEnabled()

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

  test("contributor drops an image onto the photo question", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/s/${collectingToken}`)
    const dropZone = page.locator("label:has(input[type=file])").first()
    await expect(dropZone).toBeVisible()

    await page.evaluate(async () => {
      const response = await fetch("/logo512.png")
      const file = new File([await response.blob()], "dropped.png", { type: "image/png" })
      const transfer = new DataTransfer()
      transfer.items.add(file)
      const zone = document.querySelector<HTMLElement>("label:has(input[type=file])")
      if (!zone) throw new Error("The image drop zone is missing.")
      const dragOver = new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      })
      zone.dispatchEvent(dragOver)
      if (!dragOver.defaultPrevented) {
        throw new Error(
          "The drop zone did not cancel dragover, so the browser would open the file."
        )
      }
      zone.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer }))
    })

    await expect(page.getByRole("button", { name: "Remove dropped.png" })).toBeVisible()
  })

  test("every route renders the legal footer and buttons show a pointer cursor", async ({
    page,
  }) => {
    for (const path of ["/", "/imprint", "/privacy", "/projects", `/s/${collectingToken}`]) {
      await page.goto(path)
      const footer = page.getByRole("contentinfo")
      await expect(footer).toHaveCount(1)
      await expect(footer.getByRole("link", { name: "Privacy" })).toBeVisible()
      await expect(footer.getByRole("link", { name: "Imprint" })).toBeVisible()
    }

    await page.goto(`/s/${collectingToken}`)
    const submit = page.getByRole("button", { name: "Submit once" })
    await expect(submit).toBeVisible()
    const cursors = await page.evaluate(() =>
      Array.from(document.querySelectorAll("button")).map((element) => ({
        disabled: element.disabled,
        cursor: getComputedStyle(element).cursor,
      }))
    )
    const enabled = cursors.filter((entry) => !entry.disabled)
    const disabled = cursors.filter((entry) => entry.disabled)
    expect(enabled.length).toBeGreaterThan(0)
    expect(enabled.every((entry) => entry.cursor === "pointer")).toBe(true)
    expect(disabled.length).toBeGreaterThan(0)
    expect(disabled.every((entry) => entry.cursor !== "pointer")).toBe(true)
  })

  test("project cards open their workspace from the full card surface", async ({ page }) => {
    await page.goto("/projects")
    const projectCard = page.getByRole("link", {
      name: "Open Lea’s farewell book workspace",
    })

    await expect(projectCard).toBeVisible()
    await projectCard.click({ position: { x: 20, y: 20 } })
    await expect(page).toHaveURL(`/projects/${closedProjectId}`)
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

  test("layout editor stays stable across selection and sidebar overflow", async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000)
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.goto(`/projects/${closedProjectId}?tab=layouts`)
    await expect(page.getByRole("heading", { name: "Page layouts" })).toBeVisible()
    const originalProject = (await (
      await request.get(`/api/projects/${closedProjectId}`)
    ).json()) as Project
    const originalLayout = originalProject.layouts.find((layout) => layout.name === "Warm quote")
    expect(originalLayout).toBeDefined()
    const originalGeometry = originalLayout!.schema.elements.map(({ id, geometry }) => ({
      id,
      geometry,
    }))
    const layoutSelect = page.getByRole("combobox", { name: "Choose a layout" })
    await expect(layoutSelect).toContainText("Warm quote")
    await expect(page.getByLabel("Visual DIN A5 landscape layout canvas")).toBeVisible()
    await expect(page.getByRole("button", { name: /^Add text for / }).first()).toBeVisible()
    await expect(page.getByRole("button", { name: /^Add image for / }).first()).toBeVisible()
    await expect(page.getByRole("button", { name: /^Add gallery for / }).first()).toBeVisible()
    for (const name of ["Add static text", "Add rectangle", "Add circle", "Add line"]) {
      await expect(page.getByRole("button", { name })).toBeVisible()
    }

    const renderedCanvas = page.locator("canvas.upper-canvas")
    const clearSelection = async () => {
      const bounds = await renderedCanvas.boundingBox()
      expect(bounds).not.toBeNull()
      await renderedCanvas.click({
        position: { x: bounds!.width - 2, y: bounds!.height - 2 },
      })
    }
    const canvasDocumentBounds = async () => {
      await renderedCanvas.waitFor({ state: "visible" })
      const bounds = await renderedCanvas.boundingBox()
      expect(bounds).not.toBeNull()
      const scroll = await page.evaluate(() => ({
        x: window.scrollX,
        y: window.scrollY,
      }))
      return {
        ...bounds!,
        x: bounds!.x + scroll.x,
        y: bounds!.y + scroll.y,
      }
    }
    const tabletBounds = await canvasDocumentBounds()
    expect(tabletBounds).not.toBeNull()
    await page
      .getByRole("button", { name: "Which memory still makes you smile?", exact: true })
      .click()
    await expect(page.getByText("Question binding")).toBeVisible()
    await expect(page.getByText("Font family")).toBeVisible()
    expect(await canvasDocumentBounds()).toEqual(tabletBounds)
    await page.getByRole("button", { name: "Rectangle", exact: true }).click()
    expect(await canvasDocumentBounds()).toEqual(tabletBounds)
    await clearSelection()
    await expect(
      page.getByText("Select an element to use alignment and layer actions.")
    ).toBeVisible()
    expect(await canvasDocumentBounds()).toEqual(tabletBounds)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
      )
    ).toBe(true)

    await page.setViewportSize({ width: 1365, height: 900 })
    await page.reload()
    await expect(page.getByRole("heading", { name: "Page layouts" })).toBeVisible()
    const desktopBounds = await canvasDocumentBounds()
    expect(desktopBounds).not.toBeNull()
    await page
      .getByRole("button", { name: "Which memory still makes you smile?", exact: true })
      .click()
    expect(await canvasDocumentBounds()).toEqual(desktopBounds)
    await page.getByRole("button", { name: "Rectangle", exact: true }).click()
    expect(await canvasDocumentBounds()).toEqual(desktopBounds)
    await clearSelection()
    await expect(
      page.getByText("Select an element to use alignment and layer actions.")
    ).toBeVisible()
    expect(await canvasDocumentBounds()).toEqual(desktopBounds)

    const currentProject = (await (
      await request.get(`/api/projects/${closedProjectId}`)
    ).json()) as Project
    expect(
      currentProject.layouts
        .find((layout) => layout.id === originalLayout!.id)!
        .schema.elements.map(({ id, geometry }) => ({ id, geometry }))
    ).toEqual(originalGeometry)

    const layersCard = page.locator('[data-slot="card"][aria-label="Layers"]')
    const inspectorCard = page.locator('[data-slot="card"][aria-label="Inspector"]')
    const layersBounds = await layersCard.boundingBox()
    const inspectorBounds = await inspectorCard.boundingBox()
    expect(layersBounds?.height).toBe(804)
    expect(inspectorBounds?.height).toBe(804)

    const sourceElement = originalLayout!.schema.elements.find(
      (element) => element.type === "rectangle"
    )
    expect(sourceElement).toBeDefined()
    try {
      const longLayoutResponse = await request.patch(
        `/api/projects/${closedProjectId}/layouts/${originalLayout!.id}`,
        {
          data: {
            expectedRevision: originalLayout!.revision,
            schema: {
              ...originalLayout!.schema,
              elements: [
                ...originalLayout!.schema.elements,
                ...Array.from({ length: 30 }, (_, index) => ({
                  ...structuredClone(sourceElement!),
                  id: `overflow-layer-${index}`,
                })),
              ],
            },
          },
        }
      )
      expect(longLayoutResponse.ok()).toBe(true)
      await page.reload()
      await expect(page.getByRole("button", { name: "Rectangle", exact: true })).toHaveCount(31)
      const layersViewport = layersCard.locator('[data-slot="scroll-area-viewport"]')
      const overflow = await layersViewport.evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }))
      expect(overflow.scrollHeight).toBeGreaterThan(overflow.clientHeight)
      await layersViewport.evaluate((element) => {
        element.scrollTop = 200
      })
      expect(await layersViewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
      expect(await canvasDocumentBounds()).toEqual(desktopBounds)
    } finally {
      const changedProject = (await (
        await request.get(`/api/projects/${closedProjectId}`)
      ).json()) as Project
      const changedLayout = changedProject.layouts.find(
        (layout) => layout.id === originalLayout!.id
      ) as LayoutRecord
      expect(
        (
          await request.patch(`/api/projects/${closedProjectId}/layouts/${changedLayout.id}`, {
            data: {
              expectedRevision: changedLayout.revision,
              schema: originalLayout!.schema,
            },
          })
        ).ok()
      ).toBe(true)
      expect(
        (
          await request.post(`/api/projects/${closedProjectId}/book`, {
            data: {
              mode: "cycle",
              seed: "demo-seed",
              manualAssignments: {},
              resolutionOverrides: [],
            },
          })
        ).ok()
      ).toBe(true)
    }

    await page.setViewportSize({ width: 1024, height: 768 })
    await page.reload()
    await page
      .getByRole("button", { name: "Which memory still makes you smile?", exact: true })
      .click()
    await page.screenshot({
      path: resolve(screenshots, "layout-editor-tablet.png"),
      fullPage: true,
    })
    await expectAccessible(page)
  })

  test("layout editor flags photo slots that do not match the question", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/projects/${closedProjectId}?tab=layouts`)
    await expect(page.getByRole("heading", { name: "Page layouts" })).toBeVisible()
    const originalProject = (await (
      await request.get(`/api/projects/${closedProjectId}`)
    ).json()) as Project
    const originalLayout = originalProject.layouts.find(
      (layout) => layout.name === "Warm quote"
    ) as LayoutRecord

    const photoPrompt = "Add one or two favourite photos"
    const mismatch = page.getByText(/photo slots? for up to/)
    await expect(mismatch).toHaveCount(0)

    try {
      await page.getByRole("button", { name: `Add image for ${photoPrompt}` }).click()
      await expect(mismatch).toHaveText("1 photo slot for up to 2 uploads")

      await page.getByRole("button", { name: `Add image for ${photoPrompt}` }).click()
      await expect(mismatch).toHaveCount(0)

      await page.getByRole("button", { name: `Add gallery for ${photoPrompt}` }).click()
      await expect(mismatch).toHaveText("6 photo slots for up to 2 uploads")
    } finally {
      const changedProject = (await (
        await request.get(`/api/projects/${closedProjectId}`)
      ).json()) as Project
      const changedLayout = changedProject.layouts.find(
        (layout) => layout.id === originalLayout.id
      ) as LayoutRecord
      expect(
        (
          await request.patch(`/api/projects/${closedProjectId}/layouts/${changedLayout.id}`, {
            data: {
              expectedRevision: changedLayout.revision,
              schema: originalLayout.schema,
            },
          })
        ).ok()
      ).toBe(true)
    }
  })

  test("answer labels edit directly on the layout canvas", async ({ page, request }) => {
    test.setTimeout(60_000)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/projects/${closedProjectId}?tab=layouts`)
    await expect(page.getByRole("heading", { name: "Page layouts" })).toBeVisible()

    const originalProject = (await (
      await request.get(`/api/projects/${closedProjectId}`)
    ).json()) as Project
    const originalLayout = originalProject.layouts.find((layout) => layout.name === "Warm quote")
    expect(originalLayout).toBeDefined()

    const renderedCanvas = page.locator("canvas.upper-canvas")
    const editLabel = async (elementId: string) => {
      const element = page.locator(`[data-layout-element-id="${elementId}"]`)
      const [elementBounds, canvasBounds] = await Promise.all([
        element.boundingBox(),
        renderedCanvas.boundingBox(),
      ])
      expect(elementBounds).not.toBeNull()
      expect(canvasBounds).not.toBeNull()
      await renderedCanvas.dblclick({
        position: {
          x: elementBounds!.x + elementBounds!.width / 2 - canvasBounds!.x,
          y: elementBounds!.y + elementBounds!.height / 2 - canvasBounds!.y,
        },
      })
    }
    const answerTop = (elementId: string) =>
      page.locator(`[data-layout-element-id="${elementId}"]`).evaluate((element) => {
        const answer = element.lastChild
        if (!answer) throw new Error("The answer text is missing.")
        const range = document.createRange()
        range.selectNodeContents(answer)
        return range.getBoundingClientRect().top - element.getBoundingClientRect().top
      })

    try {
      await expect(page.locator("[data-editor-empty-label]")).toHaveText("Add label…")

      const answerTopBeforeEditing = await answerTop("warm-memory")
      await editLabel("warm-memory")
      expect(await answerTop("warm-memory")).toBeCloseTo(answerTopBeforeEditing, 0)
      await page.locator("[data-layout-canvas]").screenshot({
        path: resolve("visual-artifacts/issues/48/after-selected-label.png"),
      })
      await page.keyboard.press("Escape")
      await expect(page.locator('[data-layout-element-id="warm-memory"] strong')).toHaveText(
        "A memory worth keeping"
      )

      await editLabel("warm-name")
      await page.keyboard.type("Name in this book")
      await page.getByRole("heading", { name: "Page layouts" }).click()
      await expect(page.locator('[data-layout-element-id="warm-name"] strong')).toHaveText(
        "Name in this book"
      )
      await expect(page.getByRole("status")).toHaveText("Saved")

      await page
        .getByRole("button", { name: "What should we call you in the book?", exact: true })
        .click()
      await expect(page.getByText("Show label", { exact: true })).toHaveCount(0)
      await expect(page.getByLabel("Custom label")).toHaveCount(0)

      const renamedProject = (await (
        await request.get(`/api/projects/${closedProjectId}`)
      ).json()) as Project
      const renamedLayout = renamedProject.layouts.find(
        (layout) => layout.id === originalLayout!.id
      )!
      const renamedElement = renamedLayout.schema.elements.find(
        (element) => element.id === "warm-name"
      )
      expect(renamedElement).toMatchObject({
        type: "bound-text",
        showLabel: true,
        label: "Name in this book",
      })
      expect(
        renamedProject.formSchema.questions.find((question) => question.id === "name")?.prompt
      ).toBe("What should we call you in the book?")

      const nameLayer = page.getByRole("button", {
        name: "What should we call you in the book?",
        exact: true,
      })
      await nameLayer.click()
      await nameLayer.press("Enter")
      await page.keyboard.type("Cancelled label")
      await page.keyboard.press("Escape")
      await expect(page.locator('[data-layout-element-id="warm-name"] strong')).toHaveText(
        "Name in this book"
      )

      await nameLayer.click()
      await nameLayer.press("Enter")
      await page.keyboard.press("Backspace")
      await page.getByRole("heading", { name: "Page layouts" }).click()
      await expect(page.locator("[data-editor-empty-label]")).toHaveText("Add label…")
      await expect
        .poll(async () =>
          page
            .locator('[data-layout-element-id="warm-name"] > span')
            .allTextContents()
            .then((lines) => lines.join(" "))
        )
        .toBe("{{ What should we call you in the book? }}")
      await expect(page.getByRole("status")).toHaveText("Saved")

      const canvasBounds = await renderedCanvas.boundingBox()
      expect(canvasBounds).not.toBeNull()
      await renderedCanvas.click({
        position: { x: canvasBounds!.width - 2, y: canvasBounds!.height - 2 },
      })
      await expect(
        page.getByText("Select an element on the canvas or in the layers list.")
      ).toBeVisible()
      await page.setViewportSize({ width: 1440, height: 1600 })
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({
        path: resolve("visual-artifacts/issues/42/after-inline-answer-label.png"),
      })

      await page.getByRole("tab", { name: "4. Book review" }).click()
      await expect(page.locator("[data-editor-empty-label]")).toHaveCount(0)
      await expect(page.getByText("Add label…", { exact: true })).toHaveCount(0)
    } finally {
      const changedProject = (await (
        await request.get(`/api/projects/${closedProjectId}`)
      ).json()) as Project
      const changedLayout = changedProject.layouts.find(
        (layout) => layout.id === originalLayout!.id
      ) as LayoutRecord
      expect(
        (
          await request.patch(`/api/projects/${closedProjectId}/layouts/${changedLayout.id}`, {
            data: {
              expectedRevision: changedLayout.revision,
              schema: originalLayout!.schema,
            },
          })
        ).ok()
      ).toBe(true)
      expect(
        (
          await request.post(`/api/projects/${closedProjectId}/book`, {
            data: originalProject.book!.settings,
          })
        ).ok()
      ).toBe(true)
    }
  })

  test("organizer creates a layout from a predefined visual background", async ({
    page,
    request,
  }) => {
    let createdLayoutId: string | undefined

    try {
      await page.goto(`/projects/${closedProjectId}?tab=layouts`)
      await page.getByRole("button", { name: "New layout" }).click()

      await expect(page.getByRole("heading", { name: "Choose a background" })).toBeVisible()
      await expect(page.getByRole("button", { name: "Create Blank background" })).toBeVisible()
      await expect(
        page.getByRole("button", { name: "Create Geometric collage background" })
      ).toBeVisible()
      await expect(
        page.getByRole("button", { name: "Create Sunset arches background" })
      ).toBeVisible()
      await expect(
        page.getByRole("button", { name: "Create Postcard frame background" })
      ).toBeVisible()

      await page.getByRole("button", { name: "Create Geometric collage background" }).click()
      await expect(page.getByRole("heading", { name: "Choose a background" })).not.toBeVisible()

      const project = (await (
        await request.get(`/api/projects/${closedProjectId}`)
      ).json()) as Project
      const created = project.layouts.find(
        (layout) => layout.name === "Geometric collage background"
      )
      expect(created).toBeDefined()
      createdLayoutId = created!.id
      expect(created!.schema.background).toBe("#fbf3e7")
      expect(created!.schema.elements).toHaveLength(13)
      expect(created!.schema.elements.every(({ locked }) => locked)).toBe(true)
      expect(created!.schema.elements[0]).toMatchObject({
        type: "rectangle",
        locked: true,
        fill: "#cddfd7",
        geometry: { x: -3, y: -3, width: 72, height: 154 },
      })
    } finally {
      if (createdLayoutId) {
        expect(
          (await request.delete(`/api/projects/${closedProjectId}/layouts/${createdLayoutId}`)).ok()
        ).toBe(true)
      }
    }
  })

  test("organizer places palette elements on the canvas and manages an empty decorative image", async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000)
    await page.setViewportSize({ width: 1365, height: 900 })
    const originalProject = (await (
      await request.get(`/api/projects/${closedProjectId}`)
    ).json()) as Project
    const originalLayout = originalProject.layouts.find((layout) => layout.name === "Warm quote")!

    try {
      await page.goto(`/projects/${closedProjectId}?tab=layouts`)
      await expect(page.getByRole("heading", { name: "Page layouts" })).toBeVisible()
      const canvas = page.locator("[data-layout-canvas]")
      const droppedTypes = [
        "bound-text",
        "image-frame",
        "gallery-frame",
        "static-text",
        "rectangle",
        "circle",
        "line",
        "decorative-image",
      ] as const

      const firstPaletteItem = page.locator('[data-palette-element-type="bound-text"]').first()
      await firstPaletteItem.evaluate((element) => {
        const transfer = new DataTransfer()
        transfer.setData("application/x-sakekeep-layout-element", '{"type":"bound-text"}')
        element.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }))
        document
          .querySelector("[data-layout-canvas]")!
          .dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer: transfer }))
      })
      await expect(canvas).toHaveAttribute("data-layout-drop-target", "true")
      await canvas.dispatchEvent("dragleave")
      await expect(canvas).not.toHaveAttribute("data-layout-drop-target")

      let layerCount = await page.locator("[data-layer-row]").count()
      for (const type of droppedTypes) {
        await page
          .locator(`[data-palette-element-type="${type}"]`)
          .first()
          .evaluate((element) => {
            const transfer = new DataTransfer()
            element.dispatchEvent(
              new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer })
            )
            const target = document.querySelector("[data-layout-canvas]")!
            const bounds = target.getBoundingClientRect()
            for (const name of ["dragenter", "dragover", "drop"]) {
              target.dispatchEvent(
                new DragEvent(name, {
                  bubbles: true,
                  clientX: bounds.left + bounds.width * 0.72,
                  clientY: bounds.top + bounds.height * 0.3,
                  dataTransfer: transfer,
                })
              )
            }
            element.dispatchEvent(
              new DragEvent("dragend", { bubbles: true, dataTransfer: transfer })
            )
          })
        await expect(page.locator("[data-layer-row]")).toHaveCount(++layerCount)
      }

      await expect(page.getByLabel("Choose decorative image")).toBeVisible()
      await expect(
        page.locator(
          '[data-testid="editor-layout-elements"] img[src="/layout-decorative-placeholder.svg"]'
        )
      ).toBeVisible()

      const beforeInvalidDrop = await page.locator("[data-layer-row]").count()
      await page
        .locator('[data-palette-element-type="rectangle"]')
        .dragTo(page.getByRole("heading", { name: "Page layouts" }))
      await expect(page.locator("[data-layer-row]")).toHaveCount(beforeInvalidDrop)

      await page.getByRole("button", { name: "Add static text" }).click()
      await expect(page.getByLabel("Content")).toBeVisible()
      await expect(page.getByText("Saved", { exact: true })).toBeVisible()

      let currentProject = (await (
        await request.get(`/api/projects/${closedProjectId}`)
      ).json()) as Project
      let currentLayout = currentProject.layouts.find((layout) => layout.id === originalLayout.id)!
      const added = currentLayout.schema.elements.slice(originalLayout.schema.elements.length)
      expect(new Set(added.map((element) => element.type))).toEqual(new Set(droppedTypes))
      expect(added.at(-1)).toMatchObject({
        type: "static-text",
        geometry: { x: 20, y: 20 },
      })
      const decorative = added.find((element) => element.type === "decorative-image")!
      expect(decorative.geometry.x).toBeGreaterThanOrEqual(-3)
      expect(decorative.geometry.y).toBeGreaterThanOrEqual(-3)
      expect(decorative.geometry.x + decorative.geometry.width).toBeLessThanOrEqual(213)
      expect(decorative.geometry.y + decorative.geometry.height).toBeLessThanOrEqual(151)

      await page.reload()
      await expect(page.getByRole("heading", { name: "Page layouts" })).toBeVisible()
      await page.getByRole("button", { name: "Decorative image", exact: true }).click()
      await page.getByLabel("Choose decorative image").setInputFiles(resolve("public/logo512.png"))
      await expect(page.getByRole("button", { name: "Remove image" })).toBeVisible()
      await expect(page.getByText("Saved", { exact: true })).toBeVisible()
      currentProject = (await (
        await request.get(`/api/projects/${closedProjectId}`)
      ).json()) as Project
      currentLayout = currentProject.layouts.find((layout) => layout.id === originalLayout.id)!
      const withImage = currentLayout.schema.elements.find(
        (element) => element.id === decorative.id && element.type === "decorative-image"
      )
      expect(withImage).toMatchObject({ geometry: decorative.geometry })
      expect(withImage).toHaveProperty("assetId")

      await page.getByRole("button", { name: "Remove image" }).click()
      await expect(page.getByLabel("Choose decorative image")).toBeVisible()
      await expect(page.getByText("Saved", { exact: true })).toBeVisible()
      currentProject = (await (
        await request.get(`/api/projects/${closedProjectId}`)
      ).json()) as Project
      currentLayout = currentProject.layouts.find((layout) => layout.id === originalLayout.id)!
      expect(currentLayout.schema.elements.find((element) => element.id === decorative.id)).toEqual(
        decorative
      )
    } finally {
      const changedProject = (await (
        await request.get(`/api/projects/${closedProjectId}`)
      ).json()) as Project
      const changedLayout = changedProject.layouts.find(
        (layout) => layout.id === originalLayout.id
      )!
      const restored = await request.patch(
        `/api/projects/${closedProjectId}/layouts/${originalLayout.id}`,
        {
          data: {
            expectedRevision: changedLayout.revision,
            name: originalLayout.name,
            schema: originalLayout.schema,
          },
        }
      )
      expect(restored.ok()).toBe(true)
      const regenerated = await request.post(`/api/projects/${closedProjectId}/book`, {
        data: {
          mode: "cycle",
          seed: "demo-seed",
          manualAssignments: {},
          resolutionOverrides: [],
        },
      })
      expect(regenerated.ok()).toBe(true)
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
