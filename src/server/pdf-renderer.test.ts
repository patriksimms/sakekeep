import { describe, expect, it } from "vitest"

import { inspectPdf, renderBookPdf } from "./pdf-renderer.ts"
import { completeForm, cycleSettings } from "../test/fixtures.ts"

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
    })
  })
})
