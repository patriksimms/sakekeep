import { describe, expect, it } from "vitest"

import {
  addElement,
  canvasToMm,
  elementExtendsBeyondBleed,
  emptyLayoutSchema,
  gallerySlots,
  layoutSchemaValidator,
  layoutGeometryLimits,
  layoutStyleLimits,
  mmToCanvas,
  resizeLayoutSchema,
} from "./layout.ts"
import { PAGE_FORMATS, PAGE_ORIENTATIONS, pageSpecification } from "./page-format.ts"
import { type LayoutElement, type ShapeElement } from "./types.ts"

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
    const scale = target.trimWidthMm / 210

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

  it("round-trips size changes without cumulative layout drift", () => {
    const original = addElement(emptyLayoutSchema(), "static-text")
    let resized = original
    for (let index = 0; index < 10; index += 1) {
      resized = resizeLayoutSchema(resized, pageSpecification("a6", "landscape"))
      resized = resizeLayoutSchema(resized, pageSpecification("a5", "landscape"))
    }

    const originalText = original.elements[0] as Extract<LayoutElement, { type: "static-text" }>
    const resizedText = resized.elements[0] as Extract<LayoutElement, { type: "static-text" }>
    expect(resizedText.geometry.x).toBeCloseTo(originalText.geometry.x, 3)
    expect(resizedText.geometry.y).toBeCloseTo(originalText.geometry.y, 3)
    expect(resizedText.geometry.width).toBeCloseTo(originalText.geometry.width, 3)
    expect(resizedText.geometry.height).toBeCloseTo(originalText.geometry.height, 3)
    expect(resizedText.text.fontSize).toBe(originalText.text.fontSize)
  })

  it("keeps supported boundary fonts proportional across DIN sizes", () => {
    const smallest = addElement(emptyLayoutSchema("a5", "landscape"), "static-text")
    const smallestText = smallest.elements[0] as Extract<LayoutElement, { type: "static-text" }>
    smallestText.text = { ...smallestText.text, fontSize: 4, minFontSize: 4 }
    const reduced = resizeLayoutSchema(smallest, pageSpecification("a6", "landscape"))
    const reducedText = reduced.elements[0] as Extract<LayoutElement, { type: "static-text" }>
    expect(reducedText.text.fontSize).toBeCloseTo(4 * (148 / 210), 3)
    expect(layoutSchemaValidator.safeParse(reduced).success).toBe(true)

    const largest = addElement(emptyLayoutSchema("a5", "landscape"), "static-text")
    const largestText = largest.elements[0] as Extract<LayoutElement, { type: "static-text" }>
    largestText.text = { ...largestText.text, fontSize: 200, minFontSize: 200 }
    const enlarged = resizeLayoutSchema(largest, pageSpecification("a4", "landscape"))
    const enlargedText = enlarged.elements[0] as Extract<LayoutElement, { type: "static-text" }>
    expect(enlargedText.text.fontSize).toBeCloseTo(200 * (297 / 210), 3)
    expect(layoutSchemaValidator.safeParse(enlarged).success).toBe(true)
  })

  it("round-trips every physical style without clamping", () => {
    let original = addElement(emptyLayoutSchema(), "image-frame", "photos")
    original = addElement(original, "gallery-frame", "photos")
    original = addElement(original, "rectangle")
    const image = original.elements[0] as Extract<LayoutElement, { type: "image-frame" }>
    const gallery = original.elements[1] as Extract<LayoutElement, { type: "gallery-frame" }>
    const rectangle = original.elements[2] as ShapeElement
    image.cornerRadius = 100
    gallery.gap = 50
    rectangle.strokeWidth = 100

    let resized = resizeLayoutSchema(original, pageSpecification("a6", "landscape"))
    resized = resizeLayoutSchema(resized, pageSpecification("a4", "landscape"))
    resized = resizeLayoutSchema(resized, pageSpecification("a5", "landscape"))

    expect(resized.elements[0]).toMatchObject({ cornerRadius: 100 })
    expect(resized.elements[1]).toMatchObject({ gap: 50 })
    expect(resized.elements[2]).toMatchObject({ strokeWidth: 100 })
    expect(layoutSchemaValidator.safeParse(resized).success).toBe(true)
  })

  it("keeps every accepted style boundary valid across same-orientation sizes", () => {
    for (const sourceFormat of PAGE_FORMATS) {
      for (const orientation of PAGE_ORIENTATIONS) {
        let source = addElement(emptyLayoutSchema(sourceFormat, orientation), "static-text")
        source = addElement(source, "static-text")
        source = addElement(source, "image-frame", "photos")
        source = addElement(source, "gallery-frame", "photos")
        source = addElement(source, "rectangle")
        const limits = layoutStyleLimits(pageSpecification(sourceFormat, orientation))
        const minimumText = source.elements[0] as Extract<LayoutElement, { type: "static-text" }>
        const maximumText = source.elements[1] as Extract<LayoutElement, { type: "static-text" }>
        minimumText.text = {
          ...minimumText.text,
          fontSize: limits.fontSize.min,
          minFontSize: limits.fontSize.min,
        }
        maximumText.text = {
          ...maximumText.text,
          fontSize: limits.fontSize.max,
          minFontSize: limits.fontSize.max,
        }
        ;(source.elements[2] as Extract<LayoutElement, { type: "image-frame" }>).cornerRadius =
          limits.cornerRadiusMax
        ;(source.elements[3] as Extract<LayoutElement, { type: "gallery-frame" }>).gap =
          limits.gapMax
        ;(source.elements[4] as ShapeElement).strokeWidth = limits.strokeWidthMax
        expect(layoutSchemaValidator.safeParse(source).success).toBe(true)

        for (const targetFormat of PAGE_FORMATS) {
          const resized = resizeLayoutSchema(source, pageSpecification(targetFormat, orientation))
          expect(layoutSchemaValidator.safeParse(resized).success).toBe(true)
        }
      }
    }
  })

  it("keeps every accepted geometry boundary valid across same-orientation sizes", () => {
    for (const sourceFormat of PAGE_FORMATS) {
      for (const orientation of PAGE_ORIENTATIONS) {
        const source = addElement(emptyLayoutSchema(sourceFormat, orientation), "rectangle")
        const limits = layoutGeometryLimits(pageSpecification(sourceFormat, orientation))
        source.elements[0]!.geometry = {
          x: limits.x.min,
          y: limits.y.max,
          width: limits.widthMax,
          height: 0.00001,
          rotation: 0,
        }
        expect(layoutSchemaValidator.safeParse(source).success).toBe(true)

        for (const targetFormat of PAGE_FORMATS) {
          const resized = resizeLayoutSchema(source, pageSpecification(targetFormat, orientation))
          expect(resized.elements[0]!.geometry.height).toBeGreaterThan(0)
          expect(layoutSchemaValidator.safeParse(resized).success).toBe(true)
        }
      }
    }
  })
})
