import { expect, test, type Locator, type Page } from "@playwright/test"
import { type FabricObject } from "fabric"
import sharp from "sharp"

type SakekeepInteraction = FabricObject & {
  sakekeepElementId?: string
  parityPersistenceMarker?: boolean
}

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

async function expectInteractionsToMatchHtml(page: Page) {
  const geometries = await page.evaluate((ids) => {
    const canvas = window.__sakekeepLayoutParityCanvas
    const surface = document.querySelector<HTMLElement>('[data-testid="editor-layout-elements"]')
    if (!canvas || !surface) throw new Error("Layout parity fixture is not ready")
    const surfaceBox = surface.getBoundingClientRect()

    return ids.map((id) => {
      const object = canvas
        .getObjects()
        .find((candidate) => (candidate as SakekeepInteraction).sakekeepElementId === id) as
        | SakekeepInteraction
        | undefined
      const element = surface.querySelector<HTMLElement>(`[data-layout-element-id="${id}"]`)
      if (!object || !element) throw new Error(`Missing parity element ${id}`)
      object.setCoords()
      const fabricBox = object.getBoundingRect()
      const htmlBox = element.getBoundingClientRect()
      const rotation = element.style.transform.match(/rotate\(([-\d.]+)deg\)/)?.[1]
      return {
        id,
        fabric: {
          x: fabricBox.left,
          y: fabricBox.top,
          width: fabricBox.width,
          height: fabricBox.height,
          rotation: object.angle,
        },
        html: {
          x: htmlBox.left - surfaceBox.left,
          y: htmlBox.top - surfaceBox.top,
          width: htmlBox.width,
          height: htmlBox.height,
          rotation: Number(rotation),
        },
      }
    })
  }, elementIds)

  for (const { id, fabric, html } of geometries) {
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(fabric[key], `${id} interaction ${key}`).toBeCloseTo(html[key], 1)
    }
    expect(fabric.rotation, `${id} interaction rotation`).toBeCloseTo(html.rotation, 3)
  }
}

async function transformInteraction(
  page: Page,
  id: string,
  eventName: "object:moving" | "object:scaling" | "object:rotating" | "object:modified"
) {
  await page.evaluate(
    ({ elementId, nextEventName }) => {
      const canvas = window.__sakekeepLayoutParityCanvas
      const object = canvas
        ?.getObjects()
        .find((candidate) => (candidate as SakekeepInteraction).sakekeepElementId === elementId) as
        | SakekeepInteraction
        | undefined
      if (!canvas || !object) throw new Error(`Interaction object ${elementId} is not ready`)
      if (nextEventName === "object:moving") {
        object.set({ left: object.left + 6, top: object.top + 4 })
      } else if (nextEventName === "object:scaling") {
        object.set({ scaleX: object.scaleX * 0.92, scaleY: object.scaleY * 1.08 })
      } else if (nextEventName === "object:rotating") {
        object.set({ angle: object.angle + 7 })
      } else {
        object.parityPersistenceMarker = true
      }
      object.setCoords()
      canvas.fire(nextEventName, { target: object })
    },
    { elementId: id, nextEventName: eventName }
  )
  if (eventName === "object:modified") {
    await page.evaluate(() => window.__sakekeepRemountLayoutParityCanvas?.())
    await page.waitForFunction((elementId) => {
      const object = window.__sakekeepLayoutParityCanvas
        ?.getObjects()
        .find((candidate) => (candidate as SakekeepInteraction).sakekeepElementId === elementId) as
        | SakekeepInteraction
        | undefined
      return object && !object.parityPersistenceMarker
    }, id)
  } else {
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    )
  }
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
  await expect(editor.locator('[data-layout-element-id="bound-memory"]')).toHaveAttribute(
    "data-text-overflow",
    "true"
  )
  await expect(preview.locator('[data-layout-element-id="bound-memory"]')).toHaveAttribute(
    "data-text-overflow",
    "true"
  )
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
    const editorRelativeBox = {
      x: editorElementBox!.x - editorBox!.x,
      y: editorElementBox!.y - editorBox!.y,
      width: editorElementBox!.width,
      height: editorElementBox!.height,
    }
    const previewRelativeBox = {
      x: previewElementBox!.x - previewBox!.x,
      y: previewElementBox!.y - previewBox!.y,
      width: previewElementBox!.width,
      height: previewElementBox!.height,
    }
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(editorRelativeBox[key], `${id} relative ${key}`).toBeCloseTo(
        previewRelativeBox[key],
        3
      )
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

test("Fabric interactions track real HTML geometry through every transform", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 })
  await page.goto("/layout-parity")
  await expect(page.locator("canvas.upper-canvas")).toBeVisible()
  await page.waitForFunction(
    (count) => window.__sakekeepLayoutParityCanvas?.getObjects().length === count,
    elementIds.length
  )

  await expectInteractionsToMatchHtml(page)

  for (const id of elementIds) {
    await transformInteraction(page, id, "object:moving")
    await expectInteractionsToMatchHtml(page)

    await transformInteraction(page, id, "object:scaling")
    await expectInteractionsToMatchHtml(page)

    await transformInteraction(page, id, "object:rotating")
    await expectInteractionsToMatchHtml(page)

    await transformInteraction(page, id, "object:modified")
    await expectInteractionsToMatchHtml(page)
  }
})

test("text frames remain editable on the HTML layer", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 })
  await page.goto("/layout-parity")

  const editor = page.getByTestId("editor-layout-elements")
  await expect(page.locator("canvas.upper-canvas")).toBeVisible()
  const boundText = editor.locator('[data-layout-element-id="bound-memory"]')
  const boundBox = await boundText.boundingBox()
  expect(boundBox).not.toBeNull()
  await page.mouse.dblclick(boundBox!.x + boundBox!.width / 2, boundBox!.y + boundBox!.height / 2)
  const boundEditor = page.locator(
    '[data-layout-inline-editor="true"][data-layout-element-id="bound-memory"]'
  )
  await expect(boundEditor).toBeVisible()
  await expect(boundEditor).toBeFocused()
  await boundEditor.fill("A renamed memory")
  await page.keyboard.press("Tab")

  await expect(boundEditor).toHaveCount(0)
  await expect(boundText.locator("strong")).toHaveText("A renamed memory")

  const staticText = editor.locator('[data-layout-element-id="static-heading"]')
  const box = await staticText.boundingBox()
  expect(box).not.toBeNull()

  await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2)
  const inlineEditor = page.locator(
    '[data-layout-inline-editor="true"][data-layout-element-id="static-heading"]'
  )
  await expect(inlineEditor).toBeVisible()
  await expect(inlineEditor).toBeFocused()
  await inlineEditor.fill("Edited directly on the page")
  await page.keyboard.press("Tab")

  await expect(inlineEditor).toHaveCount(0)
  await expect(staticText).toHaveText("Edited directly on the page")
})
