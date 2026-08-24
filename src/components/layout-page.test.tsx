import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { addElement, emptyLayoutSchema } from "#/domain/layout.ts"
import { pageSpecification } from "#/domain/page-format.ts"
import { layoutText, textRunsForElement } from "#/domain/text-layout.ts"
import { type ImageAnswer, type SubmissionSummary } from "#/domain/types.ts"

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

describe("vertical text alignment", () => {
  const roomyStaticText = (verticalAlignment: "top" | "middle" | "bottom") => {
    const schema = addElement(emptyLayoutSchema(), "static-text")
    const element = schema.elements[0]!
    if (element.type !== "static-text") throw new Error("Expected static text")
    element.content = "A short note"
    element.geometry = { ...element.geometry, width: 80, height: 40 }
    element.text = { ...element.text, verticalAlignment }
    return { schema, element }
  }

  it("leaves top-aligned text without any offset", () => {
    const markup = renderToStaticMarkup(
      <LayoutPageElements schema={roomyStaticText("top").schema} />
    )

    expect(markup).not.toContain("padding-top")
  })

  it("offsets the text block by the same slack the PDF renderer uses", () => {
    for (const [verticalAlignment, share] of [
      ["middle", 0.5],
      ["bottom", 1],
    ] as const) {
      const { schema, element } = roomyStaticText(verticalAlignment)
      const layout = layoutText(
        textRunsForElement(element),
        element.geometry.width,
        element.geometry.height,
        element.text
      )
      const slack = element.geometry.height - layout.renderedLines.length * layout.lineHeightMm
      expect(layout.offsetYMm).toBeCloseTo(slack * share, 10)

      const markup = renderToStaticMarkup(<LayoutPageElements schema={schema} />)
      const expected = (layout.offsetYMm / pageSpecification().mediaWidthMm) * 100

      expect(markup).toContain(`padding-top:${expected}cqw`)
    }
  })

  it("keeps overflowing text top-anchored so a flagged page is not pushed further off the page", () => {
    const { schema, element } = roomyStaticText("bottom")
    if (element.type !== "static-text") throw new Error("Expected static text")
    element.content = "A memory with enough words to wrap onto several lines"
    element.geometry = { ...element.geometry, width: 30, height: 8 }

    const markup = renderToStaticMarkup(<LayoutPageElements schema={schema} />)

    expect(markup).toContain('data-text-overflow="true"')
    expect(markup).not.toContain("padding-top")
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

describe("photo distribution in the preview", () => {
  function photo(assetId: string): ImageAnswer {
    return {
      assetId,
      name: `${assetId}.jpg`,
      mimeType: "image/jpeg",
      width: 3000,
      height: 2000,
      sizeBytes: 1_000,
      previewUrl: `/preview/${assetId}.jpg`,
    }
  }

  const submission: SubmissionSummary = {
    id: "submission",
    sequence: 1,
    submittedAt: "2026-07-18T00:00:00.000Z",
    answers: { photos: [photo("first"), photo("second")] },
  }

  it("renders a different photo in each frame bound to one question", () => {
    let schema = addElement(emptyLayoutSchema(), "image-frame", "photos")
    schema = addElement(schema, "image-frame", "photos")
    schema.elements[0]!.geometry = { x: 10, y: 10, width: 40, height: 30, rotation: 0 }
    schema.elements[1]!.geometry = { x: 10, y: 60, width: 40, height: 30, rotation: 0 }

    const markup = renderToStaticMarkup(
      <LayoutPageElements schema={schema} content={{ submission }} />
    )

    expect(markup).toContain(`src="/preview/first.jpg"`)
    expect(markup).toContain(`src="/preview/second.jpg"`)
    expect(markup.indexOf("/preview/first.jpg")).toBeLessThan(markup.indexOf("/preview/second.jpg"))
  })

  it("leaves a frame empty once the uploaded photos run out", () => {
    let schema = addElement(emptyLayoutSchema(), "image-frame", "photos")
    schema = addElement(schema, "image-frame", "photos")
    schema = addElement(schema, "image-frame", "photos")
    schema.elements.forEach((element, index) => {
      element.geometry = { x: 10, y: 10 + index * 40, width: 40, height: 30, rotation: 0 }
    })

    const markup = renderToStaticMarkup(
      <LayoutPageElements schema={schema} content={{ submission }} />
    )

    expect(markup.match(/<img/g)).toHaveLength(2)
    expect(markup).toContain("border-dashed")
  })
})
