import { expect, test } from "@playwright/test"

import type { Project } from "../src/domain/types.ts"

const projectId = "11111111-1111-4111-8111-111111111111"
const projectPath = `/api/projects/${projectId}`

for (const viewport of [
  { width: 820, height: 1180 },
  { width: 1024, height: 768 },
  { width: 1365, height: 900 },
]) {
  test(`canvas and properties stay within reach at ${viewport.width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(viewport)
    const original = (await (await request.get(projectPath)).json()) as Project
    const layout = original.layouts.find((item) => item.name === "Warm quote")!
    const savedLayout = async () => {
      const project = (await (await request.get(projectPath)).json()) as Project
      return project.layouts.find((item) => item.id === layout.id)!
    }
    try {
      await page.goto(`/projects/${projectId}?tab=layouts`)
      const layer = page.getByRole("button", {
        name: "Which memory still makes you smile?",
        exact: true,
      })
      await layer.click()
      const canvas = page.locator("canvas.upper-canvas")
      const inspector = page.getByTestId("layout-inspector")
      await canvas.scrollIntoViewIfNeeded()
      const canvasBox = (await canvas.boundingBox())!
      const inspectorBox = (await inspector.boundingBox())!
      expect(canvasBox.width).toBeGreaterThanOrEqual(320)
      expect(inspectorBox.x).toBeGreaterThan(canvasBox.x + canvasBox.width)
      expect(canvasBox.y).toBeGreaterThanOrEqual(65)
      expect(canvasBox.y + canvasBox.height).toBeLessThanOrEqual(viewport.height + 1)

      // Keyboard changes to the text bounding box remain next to the visible canvas.
      const width = inspector.getByRole("spinbutton", { name: "Width", exact: true })
      const initialWidth = Number(await width.inputValue())
      await width.focus()
      await width.press("ArrowDown")
      await width.press("Tab")
      await expect(width).toHaveValue(String(initialWidth - 0.5))
      await expect
        .poll(
          async () =>
            (await savedLayout()).schema.elements.find((e) => e.id === "warm-memory")?.geometry
              .width
        )
        .toBe(initialWidth - 0.5)
      const afterEdit = (await canvas.boundingBox())!
      expect(afterEdit.y).toBeGreaterThanOrEqual(65)
      expect(afterEdit.y + afterEdit.height).toBeLessThanOrEqual(viewport.height + 1)

      // Pointer selection, then keyboard entry into the bound-text label.
      await canvas.click({ position: { x: canvasBox.width - 2, y: canvasBox.height - 2 } })
      await expect(inspector.getByTestId("button-delete-selected-element")).toBeHidden()
      const textBox = (await page.locator('[data-layout-element-id="warm-memory"]').boundingBox())!
      await page.mouse.click(textBox.x + textBox.width / 2, textBox.y + textBox.height / 2)
      await expect(width).toBeVisible()
      await layer.press("Enter")
      await expect(page.locator('[data-layout-inline-editor="true"]')).toBeFocused()
      await page.keyboard.press("Escape")

      // Photo focus is editable by pointer and keyboard and survives a reload.
      await page.getByTestId("add-image-frame").first().click()
      const horizontal = inspector.getByRole("spinbutton", { name: "Horizontal", exact: true })
      await horizontal.click()
      await horizontal.fill("0.7")
      await horizontal.press("ArrowUp")
      await horizontal.press("Tab")
      await expect(horizontal).toHaveValue("0.75")
      await expect
        .poll(
          async () =>
            (await savedLayout()).schema.elements.find((e) => e.type === "image-frame")?.focalPoint
              ?.x
        )
        .toBe(0.75)
      await page.reload()
      await page.getByTestId("layer-image-frame").click()
      await expect(horizontal).toHaveValue("0.75")
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
    } finally {
      const current = await savedLayout()
      expect(
        (
          await request.patch(`${projectPath}/layouts/${layout.id}`, {
            data: { expectedRevision: current.revision, schema: layout.schema },
          })
        ).ok()
      ).toBe(true)
    }
  })
}
