import { describe, expect, it } from "vitest"

import { layoutSchemaValidator } from "./layout.ts"
import { BACKGROUND_PRESETS, backgroundSchema } from "./layout-backgrounds.ts"

describe("layout background presets", () => {
  it("provides a blank page and a visual-only geometric collage", () => {
    expect(BACKGROUND_PRESETS.map(({ id }) => id)).toEqual(["blank", "geometric-collage"])

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
    expect(first.elements).toHaveLength(20)
    expect(first.elements.every(({ locked }) => locked)).toBe(true)
    expect(first.elements.map(({ type }) => type)).toContain("line")
    expect(first.elements[0]).toMatchObject({
      type: "rectangle",
      fill: "#cddfd7",
      geometry: { x: -3, y: -3, width: 57, height: 154 },
    })
    expect(first.elements.map(({ id }) => id)).not.toEqual(second.elements.map(({ id }) => id))
  })
})
