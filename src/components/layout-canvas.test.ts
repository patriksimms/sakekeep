import { describe, expect, it } from "vitest"

import { addElement, emptyLayoutSchema } from "#/domain/layout.ts"

import { applyInlineStaticTextEdit, parseLayoutElementDragData } from "./layout-canvas.tsx"

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
