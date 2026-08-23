import { describe, expect, it } from "vitest"

import { inspectPdf, renderBookPdf } from "./pdf-renderer.ts"
import { pageSpecification } from "../domain/page-format.ts"
import { completeForm, cycleSettings, layoutFixture, submissionFixture } from "../test/fixtures.ts"

describe("PDF renderer", () => {
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
