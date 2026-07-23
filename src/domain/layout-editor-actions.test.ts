// @vitest-environment jsdom

import { describe, expect, it } from "vitest"

import { addElement, emptyLayoutSchema } from "./layout.ts"
import { isEditorDeleteKey, moveElementLayer } from "./layout-editor-actions.ts"

function elements() {
  let schema = addElement(emptyLayoutSchema(), "rectangle")
  schema = addElement(schema, "circle")
  schema = addElement(schema, "line")
  return schema.elements
}

describe("layout editor actions", () => {
  it("moves elements one step or to an absolute stack boundary", () => {
    const original = elements()
    const [back, middle, front] = original

    expect(moveElementLayer(original, middle!.id, "backward")).toEqual([middle, back, front])
    expect(moveElementLayer(original, middle!.id, "forward")).toEqual([back, front, middle])
    expect(moveElementLayer(original, middle!.id, "back")).toEqual([middle, back, front])
    expect(moveElementLayer(original, middle!.id, "front")).toEqual([back, front, middle])
  })

  it("does not change elements already at the requested boundary", () => {
    const original = elements()

    expect(moveElementLayer(original, original[0]!.id, "backward")).toBe(original)
    expect(moveElementLayer(original, original[0]!.id, "back")).toBe(original)
    expect(moveElementLayer(original, original.at(-1)!.id, "forward")).toBe(original)
    expect(moveElementLayer(original, original.at(-1)!.id, "front")).toBe(original)
  })

  it("handles deletion keys only outside editable controls and inline text editing", () => {
    const event = {
      key: "Delete",
      defaultPrevented: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
    }
    const input = document.createElement("input")
    const textarea = document.createElement("textarea")
    const select = document.createElement("select")
    const editable = document.createElement("div")
    editable.setAttribute("contenteditable", "true")
    const editableChild = document.createElement("span")
    editable.append(editableChild)

    expect(isEditorDeleteKey(event, document.body, false)).toBe(true)
    expect(isEditorDeleteKey({ ...event, key: "Backspace" }, document.body, false)).toBe(true)
    expect(isEditorDeleteKey(event, input, false)).toBe(false)
    expect(isEditorDeleteKey(event, textarea, false)).toBe(false)
    expect(isEditorDeleteKey(event, select, false)).toBe(false)
    expect(isEditorDeleteKey(event, editableChild, false)).toBe(false)
    expect(isEditorDeleteKey(event, document.body, true)).toBe(false)
    expect(isEditorDeleteKey({ ...event, ctrlKey: true }, document.body, false)).toBe(false)
    expect(isEditorDeleteKey({ ...event, key: "Enter" }, document.body, false)).toBe(false)
  })
})
