import { describe, expect, it } from "vitest"

import { createPreflightReport, hasFailedPreflight } from "./preflight.ts"
import { generateBook } from "./generation.ts"
import { pageSpecification } from "./page-format.ts"
import { completeForm, cycleSettings, layoutFixture, submissionFixture } from "../test/fixtures.ts"

function book() {
  return generateBook({
    projectId: "99999999-9999-4999-8999-999999999999",
    form: completeForm,
    layouts: [layoutFixture()],
    submissions: [submissionFixture("10000000-0000-4000-8000-000000000001", 1)],
    settings: cycleSettings,
    now: "2026-07-18T00:00:00.000Z",
  })
}

describe("preflight", () => {
  it("passes only a current, structurally valid export", () => {
    const report = createPreflightReport({
      projectId: book().projectId,
      book: book(),
      bookStatus: "current",
      pageCount: 1,
      fontsEmbedded: true,
      outputIntentEmbedded: true,
      pageBoxesValid: true,
      assetResolutionMetadata: true,
      assetResolutionCount: 0,
      marks: false,
      now: "2026-07-18T00:00:00.000Z",
    })
    expect(hasFailedPreflight(report)).toBe(false)
    expect(report.pdfx.structurallyVerified).toBe(true)
  })

  it("reports the selected DIN format", () => {
    const report = createPreflightReport({
      projectId: book().projectId,
      book: book(),
      bookStatus: "current",
      pageCount: 1,
      fontsEmbedded: true,
      outputIntentEmbedded: true,
      pageBoxesValid: true,
      assetResolutionMetadata: true,
      assetResolutionCount: 0,
      marks: false,
      pageSpecification: pageSpecification("a4", "portrait"),
    })

    expect(report.specification).toMatchObject({
      standard: "DIN/ISO A4 portrait",
      trimMm: [210, 297],
      mediaBoxMm: [216, 303],
      bleedMm: 3,
      safeMarginMm: 6,
    })
  })

  it("blocks stale generation and invalid PDF structure", () => {
    const report = createPreflightReport({
      projectId: book().projectId,
      book: book(),
      bookStatus: "stale",
      pageCount: 0,
      fontsEmbedded: false,
      outputIntentEmbedded: false,
      pageBoxesValid: false,
      assetResolutionMetadata: false,
      assetResolutionCount: 0,
      marks: true,
    })
    expect(hasFailedPreflight(report)).toBe(true)
    expect(report.checks.filter((check) => check.status === "fail").length).toBe(6)
  })

  it("reports empty decorative images as a non-blocking export warning", () => {
    const generated = book()
    generated.pages[0]!.problems.push({
      id: "empty-decorative",
      code: "empty-decorative-image",
      pageId: generated.pages[0]!.id,
      elementId: "decorative-element",
      message: "An empty decorative image is omitted.",
      blocking: false,
    })
    const report = createPreflightReport({
      projectId: generated.projectId,
      book: generated,
      bookStatus: "current",
      pageCount: generated.pages.length,
      fontsEmbedded: true,
      outputIntentEmbedded: true,
      pageBoxesValid: true,
      assetResolutionMetadata: true,
      assetResolutionCount: 0,
      marks: false,
    })

    expect(report.checks).toContainEqual(
      expect.objectContaining({ id: "empty-decorative-images", status: "warning" })
    )
    expect(hasFailedPreflight(report)).toBe(false)
  })

  it("allows export when a static element extends beyond the bleed boundary", () => {
    const generated = book()
    generated.pages[0]!.problems.push({
      id: "static-outside-print-area",
      code: "outside-print-area",
      pageId: generated.pages[0]!.id,
      elementId: "static-element",
      message: "A static element extends beyond the bleed boundary.",
      blocking: false,
    })
    const report = createPreflightReport({
      projectId: generated.projectId,
      book: generated,
      bookStatus: "current",
      pageCount: generated.pages.length,
      fontsEmbedded: true,
      outputIntentEmbedded: true,
      pageBoxesValid: true,
      assetResolutionMetadata: true,
      assetResolutionCount: 0,
      marks: false,
    })

    expect(report.checks).toContainEqual(
      expect.objectContaining({ id: "blocking-problems", status: "pass" })
    )
    expect(hasFailedPreflight(report)).toBe(false)
  })
})
