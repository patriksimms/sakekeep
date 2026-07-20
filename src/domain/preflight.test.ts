import { describe, expect, it } from "vitest"

import { createPreflightReport, hasFailedPreflight } from "./preflight.ts"
import { generateBook } from "./generation.ts"
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
})
