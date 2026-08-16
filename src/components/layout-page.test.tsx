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
