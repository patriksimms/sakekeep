import { describe, expect, it } from "vitest"

import {
  addElement,
  canvasToMm,
  elementExtendsBeyondBleed,
  emptyLayoutSchema,
  gallerySlots,
  layoutSchemaValidator,
  mmToCanvas,
  resizeLayoutSchema,
} from "./layout.ts"
import { pageSpecification } from "./page-format.ts"

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

  it("centres dropped elements beneath the pointer and keeps them inside the bleed", () => {
    const centered = addElement(emptyLayoutSchema(), "rectangle", undefined, { x: 108, y: 77 })
    expect(centered.elements[0]?.geometry).toMatchObject({ x: 73, y: 59.5 })

    const topLeft = addElement(emptyLayoutSchema(), "gallery-frame", "photos", { x: -3, y: -3 })
    expect(topLeft.elements[0]?.geometry).toMatchObject({ x: -3, y: -3 })

    const bottomRight = addElement(emptyLayoutSchema(), "gallery-frame", "photos", {
      x: 213,
      y: 151,
    })
    expect(bottomRight.elements[0]?.geometry).toMatchObject({ x: 113, y: 86 })
    expect(elementExtendsBeyondBleed(bottomRight.elements[0]!)).toBe(false)
  })

  it("persists an empty decorative image", () => {
    const schema = addElement(emptyLayoutSchema(), "decorative-image")
    expect(layoutSchemaValidator.parse(schema).elements[0]).toMatchObject({
      type: "decorative-image",
      geometry: { x: 20, y: 20, width: 70, height: 35 },
    })
    expect(schema.elements[0]).not.toHaveProperty("assetId")
  })

  it("scales geometry and physical styling proportionally between same-orientation formats", () => {
    let schema = addElement(emptyLayoutSchema(), "static-text")
    schema = addElement(schema, "gallery-frame", "photos")
    const sourceText = schema.elements[0]!
    const sourceGallery = schema.elements[1]!
    const target = pageSpecification("a4", "landscape")
    const resized = resizeLayoutSchema(schema, target)
    const scale = Math.min(target.mediaWidthMm / 216, target.mediaHeightMm / 154)

    expect(resized.trim).toEqual({ widthMm: 297, heightMm: 210 })
    expect(resized.elements[0]?.geometry.width).toBeCloseTo(sourceText.geometry.width * scale, 3)
    expect(resized.elements[0]).toMatchObject({
      type: "static-text",
      text: { fontSize: expect.closeTo(16 * scale, 3) },
    })
    expect(resized.elements[1]).toMatchObject({
      type: "gallery-frame",
      gap: expect.closeTo(3 * scale, 3),
    })
    expect(sourceGallery.geometry).toEqual({ x: 20, y: 20, width: 100, height: 65, rotation: 0 })
    expect(layoutSchemaValidator.safeParse(resized).success).toBe(true)
  })
})
