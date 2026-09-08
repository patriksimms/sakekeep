import * as m from "#/paraglide/messages.js"
import { problemMessage } from "#/domain/problem-message.ts"
import { blockingProblems } from "./generation"
import { pageSpecification, type PageSpecification } from "./page-format.ts"
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
  allowBlockingProblems?: boolean
  pageSpecification?: PageSpecification
  now?: string
}): ExportReport {
  const specification = input.pageSpecification ?? pageSpecification()
  const problems = blockingProblems(input.book)
  const blockingProblemsAccepted = input.allowBlockingProblems === true && problems.length > 0
  const emptyDecorativeImages = input.book.pages.flatMap((page) =>
    page.problems.filter((problem) => problem.code === "empty-decorative-image")
  )
  const checks: PreflightCheck[] = [
    {
      id: "generation-current",
      label: m.ui_generated_book_is_current(),
      status: input.bookStatus === "current" ? "pass" : "fail",
      detail:
        input.bookStatus === "current"
          ? m.ui_the_rendered_source_matches_the_persisted_generation()
          : m.ui_regenerate_the_complete_book_before_export(),
    },
    {
      id: "blocking-problems",
      label: m.ui_no_blocking_layout_problems(),
      status: problems.length === 0 ? "pass" : blockingProblemsAccepted ? "warning" : "fail",
      detail:
        problems.length === 0
          ? m.ui_no_unresolved_blocking_problems_were_found()
          : blockingProblemsAccepted
            ? m.accepted_problem_count({ value0: problems.length })
            : m.remaining_problem_count({ value0: problems.length }),
    },
    {
      id: "page-boxes",
      label: m.ui_page_boxes_and_physical_dimensions(),
      status: input.pageBoxesValid ? "pass" : "fail",
      detail: m.media_size_detail({
        value0: specification.mediaWidthMm,
        value1: specification.mediaHeightMm,
      }),
    },
    {
      id: "page-count",
      label: m.ui_page_count(),
      status: input.pageCount === input.book.pages.length ? "pass" : "fail",
      detail: m.page_count_detail({ value0: input.pageCount }),
    },
    {
      id: "fonts",
      label: m.ui_fonts_embedded(),
      status: input.fontsEmbedded ? "pass" : "fail",
      detail: input.fontsEmbedded
        ? m.ui_bundled_fonts_are_embedded_in_the_pdf()
        : m.ui_one_or_more_fonts_are_not_embedded(),
    },
    {
      id: "output-intent",
      label: m.ui_output_intent(),
      status: input.outputIntentEmbedded ? "pass" : "fail",
      detail: input.outputIntentEmbedded
        ? m.ui_an_icc_output_intent_is_present()
        : m.ui_the_required_icc_output_intent_is_missing(),
    },
    {
      id: "image-resolution",
      label: m.ui_effective_image_resolution(),
      status: !input.assetResolutionMetadata
        ? "fail"
        : problems.some((problem) => problem.code === "image-blocking-resolution")
          ? blockingProblemsAccepted
            ? "warning"
            : "fail"
          : input.book.pages.some((page) =>
                page.problems.some((problem) => problem.code === "image-low-resolution")
              )
            ? "warning"
            : "pass",
      detail: input.assetResolutionMetadata
        ? m.resolution_metadata_detail({ value0: input.assetResolutionCount })
        : m.ui_the_pdf_is_missing_machine_readable_effective_resolution_metadata(),
    },
    {
      id: "empty-decorative-images",
      label: m.ui_decorative_images_selected(),
      status: emptyDecorativeImages.length > 0 ? "warning" : "pass",
      detail:
        emptyDecorativeImages.length > 0
          ? m.omitted_image_count({ value0: emptyDecorativeImages.length })
          : m.ui_every_decorative_image_placement_has_an_image_selected(),
    },
  ]

  const overrides = input.book.settings.resolutionOverrides.map((assetId) => ({
    assetId,
    reason: m.ui_organizer_explicitly_accepted_an_image_below_the_150_effective_pp(),
  }))

  return {
    version: 1,
    projectId: input.projectId,
    sourceFingerprint: input.book.sourceFingerprint,
    generatedAt: input.now ?? new Date().toISOString(),
    specification: {
      standard: specification.standard,
      trimMm: [specification.trimWidthMm, specification.trimHeightMm],
      bleedMm: 3,
      mediaBoxMm: [specification.mediaWidthMm, specification.mediaHeightMm],
      safeMarginMm: 6,
      targetPpi: 300,
      blockingPpi: 150,
      printCondition: "PSO Coated v3 / FOGRA51",
      marks: input.marks,
    },
    checks,
    overrides,
    ignoredProblems: blockingProblemsAccepted ? problems : [],
    pdfx: {
      target: "PDF/X-4",
      structurallyVerified:
        input.fontsEmbedded && input.outputIntentEmbedded && input.pageBoxesValid,
      limitation: m.pdfx_limitation(),
    },
  }
}

export function hasFailedPreflight(report: ExportReport): boolean {
  return report.checks.some((check) => check.status === "fail")
}

export function reportAsText(report: ExportReport): string {
  const lines = [
    m.ui_sakekeep_print_preflight_report(),
    m.report_generated({ value0: report.generatedAt }),
    m.report_project({ value0: report.projectId }),
    m.report_fingerprint({ value0: report.sourceFingerprint }),
    "",
    m.ui_specification(),
    `- ${report.specification.standard}`,
    m.report_trim({ value0: report.specification.trimMm.join(" × ") }),
    m.report_bleed({ value0: report.specification.bleedMm }),
    m.report_media_box({ value0: report.specification.mediaBoxMm.join(" × ") }),
    m.report_safe_margin({ value0: report.specification.safeMarginMm }),
    m.report_print_condition({ value0: report.specification.printCondition }),
    m.report_printer_marks({
      value0: report.specification.marks ? m.report_enabled() : m.report_disabled(),
    }),
    "",
    m.ui_checks(),
    ...report.checks.map(
      (check) => `- [${check.status.toUpperCase()}] ${check.label}: ${check.detail}`
    ),
    "",
    m.ui_resolution_overrides(),
    ...(report.overrides.length
      ? report.overrides.map((override) => `- ${override.assetId}: ${override.reason}`)
      : [m.ui_none()]),
    "",
    m.ui_accepted_blocking_problems(),
    ...(report.ignoredProblems?.length
      ? report.ignoredProblems.map(
          (problem) =>
            `- ${problem.pageId}${problem.elementId ? ` / ${problem.elementId}` : ""}: ${problemMessage(problem)}`
        )
      : [m.ui_none()]),
    "",
    "PDF/X-4",
    m.report_structural_checks({
      value0: report.pdfx.structurallyVerified ? m.report_passed() : m.report_failed(),
    }),
    m.report_limitation({ value0: report.pdfx.limitation ?? m.ui_none_443() }),
  ]
  return `${lines.join("\n")}\n`
}
