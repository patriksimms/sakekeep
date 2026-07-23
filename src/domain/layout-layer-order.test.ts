import { describe, expect, it } from "vitest"

import { addElement, emptyLayoutSchema } from "./layout.ts"
import { reorderElementsFromTopmostList } from "./layout-layer-order.ts"

function elements() {
  let schema = addElement(emptyLayoutSchema(), "rectangle")
  schema = addElement(schema, "circle")
  schema = addElement(schema, "line")
  return schema.elements
}

describe("layout layer drag order", () => {
  it("maps topmost-first drops back to canonical back-to-front order", () => {
    const original = elements()
    const [back, middle, front] = original

    expect(reorderElementsFromTopmostList(original, back!.id, front!.id, "before")).toEqual([
      middle,
      front,
      back,
    ])
    expect(reorderElementsFromTopmostList(original, front!.id, back!.id, "after")).toEqual([
      front,
      back,
      middle,
    ])
  })

  it("preserves element identity and geometry while reordering", () => {
    const original = elements()
    const geometry = original.map((element) => element.geometry)
    const reordered = reorderElementsFromTopmostList(
      original,
      original[0]!.id,
      original[2]!.id,
      "before"
    )

    expect(new Set(reordered)).toEqual(new Set(original))
    expect(reordered.map((element) => element.geometry)).toEqual([
      geometry[1],
      geometry[2],
      geometry[0],
    ])
  })

  it("leaves order unchanged for cancelled or ineffective drops", () => {
    const original = elements()

    expect(reorderElementsFromTopmostList(original, original[0]!.id, "missing", "before")).toBe(
      original
    )
    expect(
      reorderElementsFromTopmostList(original, original[0]!.id, original[0]!.id, "after")
    ).toBe(original)
    expect(
      reorderElementsFromTopmostList(original, original[2]!.id, original[1]!.id, "before")
    ).toBe(original)
  })
})
