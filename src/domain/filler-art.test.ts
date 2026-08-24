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

function colourDistance(left: string, right: string): number {
  const channels = (colour: string) =>
    [1, 3, 5].map((start) => Number.parseInt(colour.slice(start, start + 2), 16))
  const leftChannels = channels(left)
  const rightChannels = channels(right)
  return Math.hypot(...leftChannels.map((channel, index) => channel - rightChannels[index]!))
}

describe("filler art palette", () => {
  it("uses companion colours instead of borrowing colours painted by the layout", () => {
    const palette = fillerPalette(emptyLayoutSchema())

    expect(palette).toEqual({ primary: "#586aa0", secondary: "#d184a6", ink: "#6b4c6f" })
  })

  it("keeps every tone visibly distinct from the standard layouts", () => {
    for (const orientation of ["landscape", "portrait"] as const) {
      for (const preset of backgroundPresets("a5", orientation)) {
        const paintedColours = new Set([
          preset.schema.background,
          ...preset.schema.elements.flatMap((element) => {
            if (element.type === "line") return [element.stroke]
            if (element.type === "rectangle" || element.type === "circle") return [element.fill]
            return []
          }),
        ])
        const palette = fillerPalette(preset.schema)

        expect(
          [palette.primary, palette.secondary, palette.ink].every((colour) =>
            [...paintedColours].every((paintedColour) =>
              Boolean(paintedColour && colourDistance(colour, paintedColour) >= 45)
            )
          ),
          preset.id
        ).toBe(true)
      }
    }
  })

  it("chooses alternate companion colours around user-painted layout colours", () => {
    const paintedColours = ["#586aa0", "#d184a6", "#6b4c6f"]
    const palette = fillerPalette(schemaWithShapes("#fffdf7", paintedColours))

    expect([palette.primary, palette.secondary, palette.ink]).toEqual([
      "#2d7f9c",
      "#cf4f8c",
      "#a47ac2",
    ])
    expect(
      [palette.primary, palette.secondary, palette.ink].every((colour) =>
        paintedColours.every((paintedColour) => colourDistance(colour, paintedColour) >= 45)
      )
    ).toBe(true)
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
