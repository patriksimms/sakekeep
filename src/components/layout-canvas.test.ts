import { describe, expect, it } from "vitest"

import { addElement, emptyLayoutSchema } from "#/domain/layout.ts"

import { applyInlineBoundLabelEdit, applyInlineStaticTextEdit } from "./layout-canvas.tsx"

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

  it("updates or clears only a bound-text label", () => {
    let schema = addElement(emptyLayoutSchema(), "bound-text", "memory")
    schema = addElement(schema, "rectangle")
    const original = schema.elements[0]!
    const renamed = applyInlineBoundLabelEdit(
      schema,
      original.id,
      "A favourite memory",
      "Question prompt"
    )

    expect(renamed?.elements[0]).toEqual({
      ...original,
      showLabel: true,
      label: "A favourite memory",
    })
    expect(renamed?.elements[1]).toBe(schema.elements[1])

    const cleared = applyInlineBoundLabelEdit(renamed!, original.id, "", "A favourite memory")
    expect(cleared?.elements[0]).toEqual({
      ...original,
      showLabel: false,
      label: "",
    })
  })

  it("ignores unchanged or non-bound labels", () => {
    let schema = addElement(emptyLayoutSchema(), "bound-text", "memory")
    schema = addElement(schema, "static-text")
    expect(
      applyInlineBoundLabelEdit(
        schema,
        schema.elements[0]!.id,
        "Question prompt",
        "Question prompt"
      )
    ).toBeNull()
    expect(
      applyInlineBoundLabelEdit(schema, schema.elements[1]!.id, "Label", "Static text")
    ).toBeNull()
  })
})
