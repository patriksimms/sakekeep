import { PAGE_SPEC } from "./layout"
import { blockingProblems } from "./generation"
import { type ExportReport, type GeneratedBook, type PreflightCheck } from "./types"

export function createPreflightReport(input: {
  projectId: string
  book: GeneratedBook
  bookStatus: "not-generated" | "current" | "stale"
  pageCount: number
  fontsEmbedded: boolean
  outputIntentEmbedded: boolean
  pageBoxesValid: boolean
  assetResolutionMetadata: boolean
  assetResolutionCount: number
  marks: boolean
  now?: string
}): ExportReport {
  const problems = blockingProblems(input.book)
  const checks: PreflightCheck[] = [
    {
      id: "generation-current",
      label: "Generated book is current",
      status: input.bookStatus === "current" ? "pass" : "fail",
      detail:
        input.bookStatus === "current"
          ? "The rendered source matches the persisted generation."
          : "Regenerate the complete book before export.",
    },
    {
      id: "blocking-problems",
      label: "No blocking layout problems",
      status: problems.length === 0 ? "pass" : "fail",
      detail:
        problems.length === 0
          ? "No unresolved blocking problems were found."
          : `${problems.length} blocking problem(s) remain.`,
    },
    {
      id: "page-boxes",
      label: "Page boxes and physical dimensions",
      status: input.pageBoxesValid ? "pass" : "fail",
      detail: `${PAGE_SPEC.mediaWidthMm} × ${PAGE_SPEC.mediaHeightMm} mm including 3 mm bleed.`,
    },
    {
      id: "page-count",
      label: "Page count",
      status: input.pageCount === input.book.pages.length ? "pass" : "fail",
      detail: `${input.pageCount} individual page(s); no imposed spreads.`,
    },
    {
      id: "fonts",
      label: "Fonts embedded",
      status: input.fontsEmbedded ? "pass" : "fail",
      detail: input.fontsEmbedded
        ? "Bundled fonts are embedded in the PDF."
        : "One or more fonts are not embedded.",
    },
    {
      id: "output-intent",
      label: "Output intent",
      status: input.outputIntentEmbedded ? "pass" : "fail",
      detail: input.outputIntentEmbedded
        ? "An ICC output intent is present."
        : "The required ICC output intent is missing.",
    },
    {
      id: "image-resolution",
      label: "Effective image resolution",
      status: !input.assetResolutionMetadata
        ? "fail"
        : problems.some((problem) => problem.code === "image-blocking-resolution")
          ? "fail"
          : input.book.pages.some((page) =>
                page.problems.some((problem) => problem.code === "image-low-resolution")
              )
            ? "warning"
            : "pass",
      detail: input.assetResolutionMetadata
        ? `${input.assetResolutionCount} placed raster asset(s) carry pixel dimensions, placed dimensions, and effective PPI metadata. Images below 300 PPI are reported; images below 150 PPI require an explicit recorded override.`
        : "The PDF is missing machine-readable effective-resolution metadata.",
    },
  ]

  const overrides = input.book.settings.resolutionOverrides.map((assetId) => ({
    assetId,
    reason: "Organizer explicitly accepted an image below the 150 effective PPI threshold.",
  }))

  return {
    version: 1,
    projectId: input.projectId,
    sourceFingerprint: input.book.sourceFingerprint,
    generatedAt: input.now ?? new Date().toISOString(),
    specification: {
      standard: "DIN/ISO A5 landscape",
      trimMm: [210, 148],
      bleedMm: 3,
      mediaBoxMm: [216, 154],
      safeMarginMm: 6,
      targetPpi: 300,
      blockingPpi: 150,
      printCondition: "PSO Coated v3 / FOGRA51",
      marks: input.marks,
    },
    checks,
    overrides,
    pdfx: {
      target: "PDF/X-4",
      structurallyVerified:
        input.fontsEmbedded && input.outputIntentEmbedded && input.pageBoxesValid,
      limitation:
        "The prototype performs structural PDF/X-4 checks but does not run an independent ISO 15930 conformance validator; see docs/PDF_PIPELINE.md.",
    },
  }
}

export function hasFailedPreflight(report: ExportReport): boolean {
  return report.checks.some((check) => check.status === "fail")
}

export function reportAsText(report: ExportReport): string {
  const lines = [
    "Sakekeep print preflight report",
    `Generated: ${report.generatedAt}`,
    `Project: ${report.projectId}`,
    `Source fingerprint: ${report.sourceFingerprint}`,
    "",
    "Specification",
    `- ${report.specification.standard}`,
    `- Trim: ${report.specification.trimMm.join(" × ")} mm`,
    `- Bleed: ${report.specification.bleedMm} mm`,
    `- Media box: ${report.specification.mediaBoxMm.join(" × ")} mm`,
    `- Safe margin: ${report.specification.safeMarginMm} mm`,
    `- Print condition: ${report.specification.printCondition}`,
    `- Printer marks: ${report.specification.marks ? "enabled" : "disabled"}`,
    "",
    "Checks",
    ...report.checks.map(
      (check) => `- [${check.status.toUpperCase()}] ${check.label}: ${check.detail}`
    ),
    "",
    "Resolution overrides",
    ...(report.overrides.length
      ? report.overrides.map((override) => `- ${override.assetId}: ${override.reason}`)
      : ["- None"]),
    "",
    "PDF/X-4",
    `- Structural checks: ${report.pdfx.structurallyVerified ? "passed" : "failed"}`,
    `- Limitation: ${report.pdfx.limitation ?? "None"}`,
  ]
  return `${lines.join("\n")}\n`
}
