import { expect, test, type Locator } from "@playwright/test"
import sharp from "sharp"

const elementIds = [
  "bleed-panel",
  "overlap-circle",
  "decorative-crop",
  "static-heading",
  "bound-memory",
  "image-crop",
  "gallery-crop",
  "diagonal-line",
]

async function renderedStyles(surface: Locator, id: string) {
  return surface.locator(`[data-layout-element-id="${id}"]`).evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius,
      borderWidth: style.borderWidth,
      color: style.color,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontStyle: style.fontStyle,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      objectPosition: getComputedStyle(element.querySelector("img") ?? element).objectPosition,
      opacity: style.opacity,
      textAlign: style.textAlign,
      transform: style.transform,
      transformOrigin: style.transformOrigin,
    }
  })
}

async function pixelDifference(first: Buffer, second: Buffer): Promise<number> {
  const [left, right] = await Promise.all([
    sharp(first).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(second).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ])
  expect(left.info).toEqual(right.info)
  let different = 0
  const channels = left.info.channels
  for (let y = 8; y < left.info.height - 8; y += 1) {
    for (let x = 8; x < left.info.width - 8; x += 1) {
      const offset = (y * left.info.width + x) * channels
      let maximumDifference = 0
      for (let channel = 0; channel < channels; channel += 1) {
        maximumDifference = Math.max(
          maximumDifference,
          Math.abs(left.data[offset + channel]! - right.data[offset + channel]!)
        )
      }
      if (maximumDifference > 8) different += 1
    }
  }
  return different / ((left.info.width - 16) * (left.info.height - 16))
}

test("Fabric editor and book preview preserve canonical rendering parity", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1400, height: 620 })
  await page.goto("/layout-parity")
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      [...document.images]
        .filter((image) => !image.complete)
        .map(
          (image) =>
            new Promise<void>((resolve) => {
              image.addEventListener("load", () => resolve(), { once: true })
              image.addEventListener("error", () => resolve(), { once: true })
            })
        )
    )
  })

  const editor = page.getByTestId("editor-layout-elements")
  const preview = page.getByTestId("preview-layout-elements")
  await expect(editor).toBeVisible()
  await expect(preview).toBeVisible()
  await expect(editor).toHaveAttribute("aria-hidden", "true")
  await expect(preview).not.toHaveAttribute("aria-hidden")

  const editorBox = await editor.boundingBox()
  const previewBox = await preview.boundingBox()
  expect(editorBox).not.toBeNull()
  expect(previewBox).not.toBeNull()
  expect(editorBox!.width / editorBox!.height).toBeCloseTo(216 / 154, 5)
  expect(previewBox!.width / previewBox!.height).toBeCloseTo(216 / 154, 5)

  for (const id of elementIds) {
    const editorElement = editor.locator(`[data-layout-element-id="${id}"]`)
    const previewElement = preview.locator(`[data-layout-element-id="${id}"]`)
    const [editorElementBox, previewElementBox] = await Promise.all([
      editorElement.boundingBox(),
      previewElement.boundingBox(),
    ])
    expect(editorElementBox, `${id} is rendered in the editor`).not.toBeNull()
    expect(previewElementBox, `${id} is rendered in the preview`).not.toBeNull()
    for (const key of ["width", "height"] as const) {
      expect(editorElementBox![key], `${id} ${key}`).toBeCloseTo(previewElementBox![key], 3)
    }
    expect(await renderedStyles(editor, id), `${id} styles`).toEqual(
      await renderedStyles(preview, id)
    )
  }

  const editorOrder = await editor
    .locator("[data-layout-element-id]")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-layout-element-id"))
    )
  const previewOrder = await preview
    .locator("[data-layout-element-id]")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-layout-element-id"))
    )
  expect(editorOrder).toEqual(elementIds)
  expect(previewOrder).toEqual(elementIds)
  await expect(page.getByText("bleed · trim · safe")).toHaveCount(0)

  await expect(editor).toHaveScreenshot("editor-layout-parity.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.015,
  })
  await expect(preview).toHaveScreenshot("preview-layout-parity.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.015,
  })
  // Absolute subpixel placement changes Linux antialiasing between the two columns even when the
  // computed boxes and styles match. Keep this looser than each surface's committed baseline.
  expect(await pixelDifference(await editor.screenshot(), await preview.screenshot())).toBeLessThan(
    0.025
  )
})
