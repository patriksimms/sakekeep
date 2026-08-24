import { describe, expect, it } from "vitest"

import {
  FILLER_MOTIFS,
  fillerMotif,
  fillerPalette,
  fillerSeed,
  MOTIF_VIEWBOX,
  motifPlacement,
} from "./filler-art.ts"
import { backgroundPresets } from "./layout-backgrounds.ts"
import { emptyLayoutSchema } from "./layout.ts"
import { type LayoutSchema, type ShapeElement } from "./types.ts"

function schemaWithShapes(background: string, fills: string[]): LayoutSchema {
  const elements: ShapeElement[] = fills.map((fill, index) => ({
    id: `shape-${index}`,
    type: "rectangle",
    geometry: { x: 0, y: index * 10, width: 40, height: 10, rotation: 0 },
    opacity: 1,
    fill,
    stroke: "transparent",
    strokeWidth: 0,
  }))
  return { ...emptyLayoutSchema(), background, elements }
}

describe("filler art palette", () => {
  it("draws its accents from the colours the layout itself uses", () => {
    const palette = fillerPalette(schemaWithShapes("#fbf3e7", ["#5b927b", "#b45f52", "#27485b"]))

    expect([palette.primary, palette.secondary, palette.ink].sort()).toEqual(
      ["#27485b", "#5b927b", "#b45f52"].sort()
    )
  })

  it("falls back to the house palette when a layout has no shapes to borrow from", () => {
    const palette = fillerPalette(emptyLayoutSchema())

    expect(palette.ink).toBe("#27485b")
    expect(palette.primary).not.toBe(palette.secondary)
  })

  it("skips shape colours that would be invisible against the page background", () => {
    const palette = fillerPalette(schemaWithShapes("#fbf3e7", ["#faf2e6", "#b45f52"]))

    expect([palette.primary, palette.secondary, palette.ink]).not.toContain("#faf2e6")
    expect([palette.primary, palette.secondary, palette.ink]).toContain("#b45f52")
  })

  it("inks with a light tone on a dark page and a dark tone on a pale one", () => {
    const pale = fillerPalette(schemaWithShapes("#fffdf7", ["#27485b", "#f0c66f", "#b45f52"]))
    const dark = fillerPalette(schemaWithShapes("#101014", ["#27485b", "#f0c66f", "#b45f52"]))

    expect(pale.ink).toBe("#27485b")
    expect(dark.ink).toBe("#f0c66f")
  })

  it("tints the slot panel away from the page so the art never floats on bare paper", () => {
    const preset = backgroundPresets("a5", "landscape").find(
      (candidate) => candidate.id === "geometric-collage"
    )!
    const palette = fillerPalette(preset.schema)

    expect(palette.base).not.toBe(preset.schema.background)
  })
})

describe("filler motif selection", () => {
  const seed = fillerSeed("11111111-1111-4111-8111-111111111111", "gallery")

  it("picks the same motif for a slot every time, so regenerating a book keeps its art", () => {
    expect(fillerMotif(seed, 2).id).toBe(fillerMotif(seed, 2).id)
  })

  it("never repeats a motif between the slots of one frame", () => {
    for (const element of ["frame-a", "frame-b", "frame-c", "gallery"]) {
      const frameSeed = fillerSeed("11111111-1111-4111-8111-111111111111", element)
      const chosen = [0, 1, 2, 3].map((slot) => fillerMotif(frameSeed, slot).id)
      expect(new Set(chosen).size).toBe(4)
    }
  })

  it("spreads motifs across frames and responses rather than reusing one", () => {
    const ids = new Set(
      ["a", "b", "c", "d", "e", "f"].flatMap((submission) =>
        ["one", "two"].map((element) => fillerMotif(fillerSeed(submission, element), 0).id)
      )
    )

    expect(ids.size).toBeGreaterThan(3)
  })
})

describe("motif drawing data", () => {
  it("keeps every motif inside the square both renderers scale", () => {
    for (const motif of FILLER_MOTIFS) {
      const coordinates = motif.shapes.flatMap((shape) =>
        (shape.d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
      )
      expect(Math.min(...coordinates), motif.id).toBeGreaterThanOrEqual(0)
      expect(Math.max(...coordinates), motif.id).toBeLessThanOrEqual(MOTIF_VIEWBOX)
    }
  })

  it("centres the motif on a slot's shorter side instead of stretching it", () => {
    const wide = motifPlacement(200, 100)
    expect(wide.scale).toBe(1)
    expect(wide.offsetX).toBe(50)
    expect(wide.offsetY).toBe(0)

    const tall = motifPlacement(50, 150)
    expect(tall.scale).toBe(0.5)
    expect(tall.offsetX).toBe(0)
    expect(tall.offsetY).toBe(50)
  })
})
