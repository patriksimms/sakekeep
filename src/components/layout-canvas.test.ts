import { Rect } from "fabric"
import { describe, expect, it } from "vitest"

import { addElement, emptyLayoutSchema, PAGE_SPEC } from "#/domain/layout.ts"
import { canonicalToMediaGeometry } from "#/domain/layout-rendering.ts"
import { type RelativeGeometry } from "#/domain/types.ts"

import {
  applyInlineStaticTextEdit,
  geometryFromObject,
  objectForElement,
  parseLayoutElementDragData,
} from "./layout-canvas.tsx"

function htmlBoundingBox(geometry: RelativeGeometry, canvasWidth: number) {
  const media = canonicalToMediaGeometry(geometry, canvasWidth)
  const angle = (media.rotation * Math.PI) / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const corners = [
    { x: media.x, y: media.y },
    { x: media.x + media.width * cosine, y: media.y + media.width * sine },
    { x: media.x - media.height * sine, y: media.y + media.height * cosine },
    {
      x: media.x + media.width * cosine - media.height * sine,
      y: media.y + media.width * sine + media.height * cosine,
    },
  ]
  const xs = corners.map(({ x }) => x)
  const ys = corners.map(({ y }) => y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return {
    left,
    top,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top,
  }
}

function expectFabricToMatchHtml(object: ReturnType<typeof objectForElement>, canvasWidth: number) {
  object.setCoords()
  const fabricBox = object.getBoundingRect()
  const htmlBox = htmlBoundingBox(geometryFromObject(object, canvasWidth), canvasWidth)

  expect(object.originX).toBe("left")
  expect(object.originY).toBe("top")
  expect(fabricBox.left).toBeCloseTo(htmlBox.left, 5)
  expect(fabricBox.top).toBeCloseTo(htmlBox.top, 5)
  expect(fabricBox.width).toBeCloseTo(htmlBox.width, 5)
  expect(fabricBox.height).toBeCloseTo(htmlBox.height, 5)
}

describe("layout interaction geometry", () => {
  it("keeps Fabric controls aligned with HTML after move, resize, and rotation", () => {
    const canvasWidth = PAGE_SPEC.mediaWidthMm * 3
    const schema = addElement(emptyLayoutSchema(), "rectangle")
    const object = objectForElement(schema.elements[0]!, canvasWidth)

    object.set({ left: 96, top: 72 })
    expectFabricToMatchHtml(object, canvasWidth)

    object.set({ scaleX: 1.7, scaleY: 0.65 })
    expectFabricToMatchHtml(object, canvasWidth)

    object.set({ angle: 23 })
    expectFabricToMatchHtml(object, canvasWidth)
  })

  it("uses the configured static text bounding box through every transform", () => {
    const canvasWidth = PAGE_SPEC.mediaWidthMm * 3
    const schema = addElement(emptyLayoutSchema(), "static-text")
    const element = schema.elements[0]!
    const object = objectForElement(element, canvasWidth)
    const initialGeometry = canonicalToMediaGeometry(element.geometry, canvasWidth)

    expect(object).toBeInstanceOf(Rect)
    expect(object.getScaledHeight()).toBeCloseTo(initialGeometry.height, 5)
    expectFabricToMatchHtml(object, canvasWidth)

    object.set({ left: 96, top: 72 })
    expectFabricToMatchHtml(object, canvasWidth)

    object.set({ scaleX: 1.7, scaleY: 0.65 })
    expectFabricToMatchHtml(object, canvasWidth)

    object.set({ angle: 23 })
    expectFabricToMatchHtml(object, canvasWidth)
  })
})
describe("inline layout text editing", () => {
  it("updates only static-text content", () => {
    let schema = addElement(emptyLayoutSchema(), "static-text")
    schema = addElement(schema, "rectangle")
    const original = schema.elements[0]!
    const next = applyInlineStaticTextEdit(schema, original.id, "Edited on the canvas")

    expect(next).not.toBeNull()
    expect(next!.elements[0]).toEqual({
      ...original,
      content: "Edited on the canvas",
    })
    expect(next!.elements[0]!.id).toBe(original.id)
    expect(next!.elements[0]!.geometry).toEqual(original.geometry)
    expect(next!.elements[1]).toBe(schema.elements[1])
  })

  it("ignores bound text and unchanged static text", () => {
    let schema = addElement(emptyLayoutSchema(), "bound-text", "memory")
    schema = addElement(schema, "static-text")
    const bound = schema.elements[0]!
    const staticText = schema.elements[1]!
    expect(applyInlineStaticTextEdit(schema, bound.id, "Submission overwrite")).toBeNull()
    expect(
      applyInlineStaticTextEdit(
        schema,
        staticText.id,
        staticText.type === "static-text" ? staticText.content : ""
      )
    ).toBeNull()
  })
})

describe("layout element drag data", () => {
  it("accepts palette data and rejects invalid or external data", () => {
    expect(
      parseLayoutElementDragData(JSON.stringify({ type: "gallery-frame", questionId: "photos" }))
    ).toEqual({ type: "gallery-frame", questionId: "photos" })
    expect(parseLayoutElementDragData(JSON.stringify({ type: "unknown" }))).toBeNull()
    expect(parseLayoutElementDragData("not json")).toBeNull()
  })
})
