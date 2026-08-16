import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { addElement, emptyLayoutSchema } from "#/domain/layout.ts"

import { LayoutPageElements } from "./layout-page.tsx"

describe("empty decorative image rendering", () => {
  it("shows the editor placeholder but omits the element from previews", () => {
    const schema = addElement(emptyLayoutSchema(), "decorative-image")

    const editor = renderToStaticMarkup(
      <LayoutPageElements
        schema={schema}
        content={{ decorativePlaceholderUrl: "/layout-decorative-placeholder.svg" }}
      />
    )
    expect(editor).toContain("/layout-decorative-placeholder.svg")
    expect(editor).toContain('data-layout-element-type="decorative-image"')

    const preview = renderToStaticMarkup(<LayoutPageElements schema={schema} />)
    expect(preview).not.toContain('data-layout-element-type="decorative-image"')
    expect(preview).not.toContain("layout-decorative-placeholder.svg")
  })
})

describe("canonical text rendering", () => {
  it("renders canonical lines and visibly marks flagged overflow", () => {
    const schema = addElement(emptyLayoutSchema(), "static-text")
    const element = schema.elements[0]!
    if (element.type !== "static-text") throw new Error("Expected static text")
    element.content = "A memory with enough words to wrap onto several lines"
    element.geometry = { ...element.geometry, width: 30, height: 8 }

    const markup = renderToStaticMarkup(<LayoutPageElements schema={schema} />)

    expect(markup).toContain('data-text-overflow="true"')
    expect(markup).toContain("outline:1px solid var(--destructive)")
    expect(markup).toContain("font-kerning:none")
    expect(markup).toContain("font-variant-ligatures:none")
    expect(markup).toContain('<span class="block"')
  })

  it("renders the canonical truncation ellipsis instead of browser clipping", () => {
    const schema = addElement(emptyLayoutSchema(), "static-text")
    const element = schema.elements[0]!
    if (element.type !== "static-text") throw new Error("Expected static text")
    element.content = "A memory with enough words to wrap onto several lines"
    element.geometry = { ...element.geometry, width: 30, height: 8 }
    element.text = { ...element.text, overflow: "truncate" }

    const markup = renderToStaticMarkup(<LayoutPageElements schema={schema} />)

    expect(markup).not.toContain("data-text-overflow")
    expect(markup).toContain("…")
  })
})

describe("selected element rendering", () => {
  it("visibly outlines the selected text bounding box", () => {
    const schema = addElement(emptyLayoutSchema(), "static-text")
    const element = schema.elements[0]!

    const preview = renderToStaticMarkup(
      <LayoutPageElements schema={schema} selectedElementId={element.id} />
    )

    expect(preview).toContain(`data-layout-element-id="${element.id}"`)
    expect(preview).toContain("outline:2px solid var(--destructive)")
  })
})
