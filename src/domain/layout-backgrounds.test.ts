import { describe, expect, it } from "vitest"

import { layoutSchemaValidator } from "./layout.ts"
import { BACKGROUND_PRESETS, backgroundSchema } from "./layout-backgrounds.ts"

describe("layout background presets", () => {
  it("provides a blank page and visual-only decorated pages", () => {
    expect(BACKGROUND_PRESETS.map(({ id }) => id)).toEqual([
      "blank",
      "geometric-collage",
      "sunset-arches",
      "postcard-frame",
    ])

    for (const preset of BACKGROUND_PRESETS) {
      expect(layoutSchemaValidator.safeParse(preset.schema).success).toBe(true)
      expect(
        preset.schema.elements.every(
          (element) =>
            element.type === "rectangle" || element.type === "circle" || element.type === "line"
        )
      ).toBe(true)
    }
  })

  it("creates independent schemas with locked decorative elements", () => {
    const first = backgroundSchema("geometric-collage")
    const second = backgroundSchema("geometric-collage")

    expect(first.background).toBe("#fbf3e7")
    expect(first.elements).toHaveLength(13)
    expect(first.elements.every(({ locked }) => locked)).toBe(true)
    expect(first.elements[0]).toMatchObject({
      type: "rectangle",
      fill: "#cddfd7",
      geometry: { x: -3, y: -3, width: 72, height: 154 },
    })
    expect(first.elements.map(({ id }) => id)).not.toEqual(second.elements.map(({ id }) => id))
  })

  // Rotation is intentionally avoided in every decorated preset: the browser rotates around an
  // element's top-left corner and the PDF export around its bottom-left, so a rotated preset
  // would not print the way it previews.
  it.each(["geometric-collage", "sunset-arches", "postcard-frame"] as const)(
    "keeps %s axis-aligned and inside the printable media area",
    (presetId) => {
      const { elements } = backgroundSchema(presetId)

      expect(elements.length).toBeGreaterThan(0)
      for (const { geometry } of elements) {
        expect(geometry.rotation).toBe(0)
        expect(geometry.x).toBeGreaterThanOrEqual(-3)
        expect(geometry.y).toBeGreaterThanOrEqual(-3)
        expect(geometry.x + geometry.width).toBeLessThanOrEqual(213)
        expect(geometry.y + geometry.height).toBeLessThanOrEqual(151)
      }
    }
  )
})
