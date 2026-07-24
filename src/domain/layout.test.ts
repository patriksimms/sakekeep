import { describe, expect, it } from "vitest"

import {
  addElement,
  canvasToMm,
  elementExtendsBeyondBleed,
  emptyLayoutSchema,
  gallerySlots,
  layoutSchemaValidator,
  mmToCanvas,
} from "./layout.ts"

describe("canonical layout schema", () => {
  it("round-trips millimetre geometry at desktop and tablet widths", () => {
    const geometry = {
      x: -2.5,
      y: 13.25,
      width: 84.5,
      height: 47.75,
      rotation: 17,
    }
    for (const editorWidth of [900, 680, 420]) {
      const roundTrip = canvasToMm(mmToCanvas(geometry, editorWidth), editorWidth)
      expect(roundTrip.rotation).toBe(geometry.rotation)
      for (const key of ["x", "y", "width", "height"] as const) {
        expect(roundTrip[key]).toBeCloseTo(geometry[key], 10)
      }
    }
  })

  it("serializes only the typed schema and rejects incompatible versions", () => {
    let schema = addElement(emptyLayoutSchema(), "static-text")
    schema = addElement(schema, "rectangle")
    schema = addElement(schema, "image-frame", "photos")
    const serialized = JSON.stringify(schema)
    expect(serialized).not.toContain("fabric")
    expect(layoutSchemaValidator.parse(JSON.parse(serialized))).toEqual(schema)
    expect(layoutSchemaValidator.safeParse({ ...schema, version: 2 }).success).toBe(false)
  })

  it("allows bleed geometry but rejects elements beyond the bleed", () => {
    const schema = addElement(emptyLayoutSchema(), "rectangle")
    const element = schema.elements[0]!
    expect(
      elementExtendsBeyondBleed({
        ...element,
        geometry: { x: -3, y: -3, width: 216, height: 154, rotation: 0 },
      })
    ).toBe(false)
    expect(
      elementExtendsBeyondBleed({
        ...element,
        geometry: { x: -3.1, y: -3, width: 216, height: 154, rotation: 0 },
      })
    ).toBe(true)
  })

  it("preserves fractional opacity and rejects non-finite or out-of-range values", () => {
    const schema = addElement(emptyLayoutSchema(), "rectangle")
    const element = schema.elements[0]!

    for (const opacity of [0, 0.35, 1]) {
      const parsed = layoutSchemaValidator.parse({
        ...schema,
        elements: [{ ...element, opacity }],
      })
      expect(parsed.elements[0]?.opacity).toBe(opacity)
    }

    for (const opacity of [-0.01, 1.01, Number.NaN]) {
      expect(
        layoutSchemaValidator.safeParse({
          ...schema,
          elements: [{ ...element, opacity }],
        }).success
      ).toBe(false)
    }
  })

  it("creates deterministic gallery slots and editable focal points", () => {
    expect(gallerySlots("four-square", 100, 60, 4)).toHaveLength(4)
    const schema = addElement(emptyLayoutSchema(), "gallery-frame", "photos")
    const frame = schema.elements[0]
    expect(frame?.type).toBe("gallery-frame")
    if (frame?.type === "gallery-frame") {
      expect(frame.focalPoint).toEqual({ x: 0.5, y: 0.5 })
    }
  })
})
