import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib"
import { describe, expect, it } from "vitest"

import { fitSingleLineTextSize, inspectPdf, renderBookPdf } from "./pdf-renderer.ts"
import { fillerPalette } from "../domain/filler-art.ts"
import { pageSpecification } from "../domain/page-format.ts"
import { completeForm, cycleSettings, layoutFixture, submissionFixture } from "../test/fixtures.ts"

/** The drawing operators of one page, so a test can assert what the exporter actually painted. */
async function pageOperators(bytes: Uint8Array, index: number): Promise<string> {
  const document = await PDFDocument.load(bytes)
  const contents = document.context.lookup(document.getPage(index).node.get(PDFName.of("Contents")))
  const streams =
    contents instanceof PDFArray
      ? contents.asArray().map((reference) => document.context.lookup(reference))
      : [contents]
  return streams
    .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
    .map((stream) => Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1"))
    .join("\n")
}

/** Matches a hex colour used as either a fill or a stroke, at the precision pdf-lib writes. */
function colorOperator(hex: string): RegExp {
  const channels = [1, 3, 5].map(
    (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
  )
  return new RegExp(`${channels.join(" ")} (rg|RG)\n`)
}

describe("PDF renderer", () => {
  it("fits standalone titles to the available page width", () => {
    expect(fitSingleLineTextSize(30, 200, 100)).toBe(15)
    expect(fitSingleLineTextSize(30, 80, 100)).toBe(30)
  })

  it("emits individual A5 landscape pages with bleed, fonts, and output intent", async () => {
    const pages = [
      {
        id: "standalone:cover",
        kind: "standalone" as const,
        pageType: "cover" as const,
        title: "Stories worth keeping",
        body: "A representative standalone page.",
        background: "#fffdf7",
        problems: [],
      },
      {
        id: "standalone:blank",
        kind: "standalone" as const,
        pageType: "blank" as const,
        title: "",
        body: "",
        background: "#dfe8da",
        problems: [],
      },
    ]
    const bytes = await renderBookPdf({
      book: {
        projectId: "99999999-9999-4999-8999-999999999999",
        settings: cycleSettings,
        pages,
        sourceFingerprint: "test",
        generatedAt: "2026-07-18T00:00:00.000Z",
        updatedAt: "2026-07-18T00:00:00.000Z",
      },
      layouts: [],
      submissions: [],
      form: completeForm,
      marks: false,
    })
    const inspection = await inspectPdf(bytes)
    expect(inspection).toEqual({
      pageCount: 2,
      pageBoxesValid: true,
      fontsEmbedded: true,
      outputIntentEmbedded: true,
      pdfxMetadata: true,
      assetResolutionMetadata: true,
      assetResolutionCount: 0,
      assetPlacements: [],
    })
  })

  it("embeds only the font cuts the book uses", async () => {
    const layout = layoutFixture()
    layout.schema.elements = layout.schema.elements.map((element) =>
      element.type === "bound-text"
        ? { ...element, text: { ...element.text, fontFamily: "Caveat" as const } }
        : element
    )
    const submission = submissionFixture("10000000-0000-4000-8000-000000000002", 1)
    const bytes = await renderBookPdf({
      book: {
        projectId: layout.projectId,
        settings: cycleSettings,
        pages: [
          {
            id: `submission:${submission.id}`,
            kind: "submission" as const,
            submissionId: submission.id,
            layoutId: layout.id,
            problems: [],
          },
        ],
        sourceFingerprint: "font-test",
        generatedAt: "2026-07-18T00:00:00.000Z",
        updatedAt: "2026-07-18T00:00:00.000Z",
      },
      layouts: [layout],
      submissions: [submission],
      form: completeForm,
      marks: false,
    })

    const raw = Buffer.from(bytes).toString("latin1")
    const embedded = new Set(
      [...raw.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+-]+)/g)].map((match) => match[1])
    )
    // The regular and bold cut of the family in use, and nothing else.
    expect(embedded.size).toBe(2)
    expect([...embedded].every((name) => name.includes("Caveat"))).toBe(true)
  })

  it("draws vector placeholder art in photo slots the contributor left empty", async () => {
    const layout = layoutFixture()
    const submission = submissionFixture("10000000-0000-4000-8000-000000000002", 1)
    const bytes = await renderBookPdf({
      book: {
        projectId: layout.projectId,
        settings: cycleSettings,
        pages: [
          {
            id: `submission:${submission.id}`,
            kind: "submission" as const,
            submissionId: submission.id,
            layoutId: layout.id,
            problems: [],
          },
        ],
        sourceFingerprint: "filler-test",
        generatedAt: "2026-07-18T00:00:00.000Z",
        updatedAt: "2026-07-18T00:00:00.000Z",
      },
      layouts: [layout],
      submissions: [submission],
      form: completeForm,
      marks: false,
    })

    const operators = await pageOperators(bytes, 0)
    const palette = fillerPalette(layout.schema)
    expect(operators).toMatch(colorOperator(palette.base))
    expect(operators).toMatch(colorOperator(palette.primary))
    // Path construction rather than an embedded raster placeholder, which is what keeps filler
    // art out of the effective-PPI checks that apply to real photos.
    expect(operators).toMatch(/ m\n/)
    expect(operators).toMatch(/ (c|v|y)\n/)
    expect(await inspectPdf(bytes)).toMatchObject({ assetResolutionCount: 0 })
  })

  it("emits portrait pages with format-specific media and trim boxes", async () => {
    const pages = [
      {
        id: "standalone:portrait",
        kind: "standalone" as const,
        pageType: "introduction" as const,
        title: "Portrait book",
        body: "This content stays within a narrow A6 page.",
        background: "#fffdf7",
        problems: [],
      },
    ]
    const bytes = await renderBookPdf({
      book: {
        projectId: "99999999-9999-4999-8999-999999999999",
        settings: cycleSettings,
        pages,
        sourceFingerprint: "portrait-test",
        generatedAt: "2026-07-18T00:00:00.000Z",
        updatedAt: "2026-07-18T00:00:00.000Z",
      },
      layouts: [],
      submissions: [],
      form: completeForm,
      marks: true,
      pageFormat: "a6",
      pageOrientation: "portrait",
    })

    expect(await inspectPdf(bytes, pageSpecification("a6", "portrait"))).toMatchObject({
      pageCount: 1,
      pageBoxesValid: true,
      fontsEmbedded: true,
    })
    expect(await inspectPdf(bytes, pageSpecification("a5", "landscape"))).toMatchObject({
      pageBoxesValid: false,
    })
  })
})
