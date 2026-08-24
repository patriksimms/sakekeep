import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { addElement, emptyLayoutSchema } from "#/domain/layout.ts"
import { pageSpecification } from "#/domain/page-format.ts"
import { layoutText, textRunsForElement } from "#/domain/text-layout.ts"
import { type ImageAnswer, type SubmissionSummary } from "#/domain/types.ts"

import { LayoutPageElements, textElementVerticalOffsetMm } from "./layout-page.tsx"

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

describe("vertical alignment while text is being edited", () => {
  it("measures the uncommitted text so the offset does not lag behind the caret", () => {
    const schema = addElement(emptyLayoutSchema(), "static-text")
    const element = schema.elements[0]!
    if (element.type !== "static-text") throw new Error("Expected static text")
    element.content = "Short"
    element.geometry = { ...element.geometry, width: 40, height: 40 }
    element.text = { ...element.text, verticalAlignment: "middle" }

    const committed = textElementVerticalOffsetMm(element, {})
    const whileTyping = textElementVerticalOffsetMm(
      element,
      {},
      "Short, and then enough further words to wrap onto several more lines"
    )

    // More lines leaves less slack, so centred text has to climb as the caret runs on.
    expect(whileTyping).toBeLessThan(committed)
    expect(whileTyping).toBeGreaterThanOrEqual(0)
    expect(textElementVerticalOffsetMm(element, {}, element.content)).toBeCloseTo(committed, 10)
  })

  it("reserves the space the edited label will need once it is committed", () => {
    const schema = addElement(emptyLayoutSchema(), "static-text")
    const element = schema.elements[0]!
    if (element.type !== "static-text") throw new Error("Expected static text")
    element.geometry = { ...element.geometry, width: 40, height: 40 }
    element.text = { ...element.text, verticalAlignment: "bottom" }

    const long = textElementVerticalOffsetMm(element, {}, "One two three four five six seven eight")
    const short = textElementVerticalOffsetMm(element, {}, "One")

    expect(long).toBeLessThan(short)
  })

  it("treats a label of nothing but spaces as absent, the way committing it would", () => {
    const schema = addElement(emptyLayoutSchema(), "bound-text")
    const element = schema.elements[0]!
    if (element.type !== "bound-text") throw new Error("Expected bound text")
    element.showLabel = false
    element.geometry = { ...element.geometry, width: 60, height: 40 }
    element.text = { ...element.text, verticalAlignment: "middle" }
    const questions = [
      { id: element.questionId, prompt: "Prompt", required: true, type: "multiline" as const },
    ]

    const render = (editingText: string) =>
      renderToStaticMarkup(
        <LayoutPageElements
          schema={schema}
          content={{ questions }}
          editingElementId={element.id}
          editingText={editingText}
        />
      )

    // The editor derives its own offset from the same rule, so blank and whitespace must agree.
    expect(textElementVerticalOffsetMm(element, { questions }, "   ")).toBeCloseTo(
      textElementVerticalOffsetMm(element, { questions }, ""),
      10
    )
    expect(render("   ")).toEqual(render(""))
  })

  it("sizes and offsets edited text from one measurement when shrink is in play", () => {
    const schema = addElement(emptyLayoutSchema(), "bound-text")
    const element = schema.elements[0]!
    if (element.type !== "bound-text") throw new Error("Expected bound text")
    element.showLabel = false
    element.geometry = { ...element.geometry, width: 45, height: 30 }
    element.text = {
      ...element.text,
      fontSize: 20,
      minFontSize: 6,
      overflow: "shrink",
      verticalAlignment: "middle",
    }
    const questions = [
      {
        id: element.questionId,
        prompt: "Prompt",
        required: true,
        type: "multiline" as const,
      },
    ]
    const label = "A rather long label that has to wrap more than once on its own"

    const markup = renderToStaticMarkup(
      <LayoutPageElements
        schema={schema}
        content={{ questions }}
        editingElementId={element.id}
        editingText={label}
      />
    )

    // The size and the offset must come from the same layout, so the rendered font size is the one
    // the combined label and answer actually shrank to.
    const combined = layoutText(
      [{ text: label, fontWeight: "bold" as const }, ...textRunsForElement(element, questions[0])],
      element.geometry.width,
      element.geometry.height,
      element.text
    )
    expect(combined.effectiveFontSize).toBeLessThan(element.text.fontSize)
    expect(markup).toContain(
      `font-size:${(combined.effectiveFontSize * (25.4 / 72) * 100) / pageSpecification().mediaWidthMm}cqw`
    )
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

  it("crops an adjusted photo by its own focus and the rest by the layout's", () => {
    let schema = addElement(emptyLayoutSchema(), "image-frame", "photos")
    schema = addElement(schema, "image-frame", "photos")
    schema.elements[0]!.geometry = { x: 10, y: 10, width: 40, height: 30, rotation: 0 }
    schema.elements[1]!.geometry = { x: 10, y: 60, width: 40, height: 30, rotation: 0 }
    schema.elements.forEach((element) => {
      if (element.type === "image-frame") element.focalPoint = { x: 0.8, y: 0.8 }
    })
    const adjusted: SubmissionSummary = {
      ...submission,
      answers: {
        photos: [{ ...photo("first"), focalPoint: { x: 0.5, y: 0.15 } }, photo("second")],
      },
    }

    const markup = renderToStaticMarkup(
      <LayoutPageElements schema={schema} content={{ submission: adjusted }} />
    )

    expect(markup).toContain("object-position:50% 15%")
    expect(markup).toContain("object-position:80% 80%")
  })

  it("only offers grab handles where the book review asked for them", () => {
    const schema = addElement(emptyLayoutSchema(), "image-frame", "photos")

    const plain = renderToStaticMarkup(
      <LayoutPageElements schema={schema} content={{ submission }} />
    )
    const adjustable = renderToStaticMarkup(
      <LayoutPageElements
        schema={schema}
        content={{
          submission,
          photoFocus: {
            draft: {},
            onChange: () => {},
            onCommit: () => {},
            onSelect: () => {},
          },
        }}
      />
    )

    expect(plain).not.toContain("data-photo-focus-handle")
    expect(adjustable).toContain('data-photo-focus-handle="first"')
  })

  it("follows the crop being dragged before anything is saved", () => {
    const schema = addElement(emptyLayoutSchema(), "image-frame", "photos")

    const markup = renderToStaticMarkup(
      <LayoutPageElements
        schema={schema}
        content={{
          submission,
          photoFocus: {
            draft: { first: { x: 0.25, y: 0.1 } },
            onChange: () => {},
            onCommit: () => {},
            onSelect: () => {},
          },
        }}
      />
    )

    expect(markup).toContain("object-position:25% 10%")
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
