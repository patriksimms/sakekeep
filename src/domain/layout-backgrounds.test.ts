import { describe, expect, it } from "vitest"

import { layoutSchemaValidator } from "./layout.ts"
import { BACKGROUND_PRESETS, backgroundSchema } from "./layout-backgrounds.ts"

describe("layout background presets", () => {
  it("provides blank and seed-derived visual backgrounds without content elements", () => {
    expect(BACKGROUND_PRESETS.map(({ id }) => id)).toEqual(["blank", "warm-quote", "playful-note"])

    for (const preset of BACKGROUND_PRESETS) {
      expect(layoutSchemaValidator.safeParse(preset.schema).success).toBe(true)
      expect(
        preset.schema.elements.every(
          (element) => element.type === "rectangle" || element.type === "circle"
        )
      ).toBe(true)
    }
  })

  it("creates independent schemas with locked decorative elements", () => {
    const first = backgroundSchema("warm-quote")
    const second = backgroundSchema("warm-quote")

    expect(first).toMatchObject({
      background: "#fff9ef",
      elements: [
        {
          type: "rectangle",
          locked: true,
          fill: "#dfe8d8",
          geometry: { x: -3, y: -3, width: 78, height: 154 },
        },
      ],
    })
    expect(first.elements[0]?.id).not.toBe(second.elements[0]?.id)
  })
})
