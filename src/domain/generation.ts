import * as m from "#/paraglide/messages.js"
import { type Locale } from "#/lib/locale.ts"
import {
  FORM_SCHEMA_VERSION,
  type BookPage,
  type FormSchema,
  type GeneratedBook,
  type GenerationSettings,
  type LayoutElement,
  type LayoutRecord,
  type PageProblem,
  type StandaloneBookPage,
  type SubmissionBookPage,
  type SubmissionSummary,
} from "./types"
import { elementExtendsBeyondBleed, gallerySlots, isCriticalElementOutsideSafeArea } from "./layout"
import { findLayoutByRole, isCoverRole, responseLayouts } from "./layout-roles.ts"
import { pageSpecificationForLayout, type PageSpecification } from "./page-format.ts"
import {
  assignPhotosToFrames,
  framePhotos,
  isPhotoFrame,
  type PhotoFrameElement,
} from "./photo-assignment.ts"
import { layoutText, textRunsForElement, type TextLayoutResult } from "./text-layout.ts"

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededUnit(seed: string, key: string): number {
  let state = hashString(`${seed}:${key}`)
  state += 0x6d2b79f5
  let value = state
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296
}

/** Only response layouts take part; cover and standalone layouts back their own pages. */
export function deterministicLayoutAssignments(
  submissions: SubmissionSummary[],
  allLayouts: LayoutRecord[],
  settings: GenerationSettings
): Record<string, string> {
  const layouts = responseLayouts(allLayouts)
  if (layouts.length === 0) return {}
  const validLayoutIds = new Set(layouts.map((layout) => layout.id))
  const assignments: Record<string, string> = {}
  submissions.forEach((submission, index) => {
    const manualLayout = settings.manualAssignments[submission.id]
    if (manualLayout && validLayoutIds.has(manualLayout)) {
      assignments[submission.id] = manualLayout
      return
    }
    if (settings.mode === "seeded-random") {
      const random = seededUnit(settings.seed, `${index}:${submission.id}`)
      assignments[submission.id] = layouts[Math.floor(random * layouts.length)]!.id
      return
    }
    assignments[submission.id] = layouts[index % layouts.length]!.id
  })
  return assignments
}

export function effectivePpi(
  pixelWidth: number,
  pixelHeight: number,
  placedWidthMm: number,
  placedHeightMm: number
): number {
  const ppiX = pixelWidth / (placedWidthMm / 25.4)
  const ppiY = pixelHeight / (placedHeightMm / 25.4)
  return Math.floor(Math.min(ppiX, ppiY))
}

function textElementName(
  element: Extract<LayoutElement, { type: "bound-text" | "static-text" }>,
  form: FormSchema
): string {
  if (element.type === "bound-text") {
    if (element.showLabel && element.label?.trim()) return element.label.trim()
    return form.questions.find((question) => question.id === element.questionId)?.prompt ?? ""
  }
  const firstLine = element.content.trim().split("\n")[0]?.trim()
  if (!firstLine) return ""
  return firstLine.length > 50 ? `${firstLine.slice(0, 47)}…` : firstLine
}

function textOverflowMessage(
  name: { name: string; occurrence: number },
  location: string | number,
  policy: "shrink" | "truncate" | "flag",
  fit: TextLayoutResult,
  heightMm: number
): PageProblem["params"] {
  return {
    ...name,
    location,
    policy,
    fontSize: fit.effectiveFontSize,
    requiredLines: fit.requiredLines,
    availableLines: fit.availableLines,
    lineHeightMm: fit.lineHeightMm,
    heightMm,
  }
}

function textProblemNames(
  elements: LayoutElement[],
  form: FormSchema
): Map<string, { name: string; occurrence: number }> {
  const textElements = elements.filter(
    (element): element is Extract<LayoutElement, { type: "bound-text" | "static-text" }> =>
      element.type === "bound-text" || element.type === "static-text"
  )
  const names = textElements.map((element) => textElementName(element, form))
  const counts = new Map<string, number>()
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)

  const occurrences = new Map<string, number>()
  return new Map(
    textElements.map((element, index) => {
      const name = names[index]!
      const occurrence = (occurrences.get(name) ?? 0) + 1
      occurrences.set(name, occurrence)
      return [element.id, { name, occurrence: counts.get(name) === 1 ? 0 : occurrence }]
    })
  )
}

/** Slot rectangles a frame prints into, in canonical millimetres relative to the frame. */
function frameSlots(element: PhotoFrameElement): Array<{ width: number; height: number }> {
  if (element.type === "image-frame") {
    return [{ width: element.geometry.width, height: element.geometry.height }]
  }
  return gallerySlots(
    element.arrangement,
    element.geometry.width,
    element.geometry.height,
    element.gap
  )
}

function problem(
  pageId: string,
  code: PageProblem["code"],
  params: PageProblem["params"],
  blocking: boolean,
  scope: { elementId?: string; assetId?: string; key?: string } = {}
): PageProblem {
  return {
    id: `${pageId}:${scope.elementId ?? "page"}:${scope.key ?? scope.assetId ?? code}:${code}`,
    code,
    pageId,
    elementId: scope.elementId,
    assetId: scope.assetId,
    params,
    blocking,
  }
}

/**
 * The checks that depend only on where an element sits, not on the response behind the page.
 * Shared by response pages and standalone pages.
 */
function inspectElementPlacement(
  pageId: string,
  element: LayoutElement,
  specification: PageSpecification
): PageProblem[] {
  const problems: PageProblem[] = []
  if (elementExtendsBeyondBleed(element, specification)) {
    problems.push(
      problem(pageId, "outside-print-area", { boundary: "bleed" }, element.type === "bound-text", {
        elementId: element.id,
      })
    )
  } else if (isCriticalElementOutsideSafeArea(element, specification)) {
    problems.push(
      problem(pageId, "outside-print-area", { boundary: "safe" }, true, { elementId: element.id })
    )
  }
  if (element.type === "decorative-image" && !element.assetId) {
    problems.push(problem(pageId, "empty-decorative-image", {}, false, { elementId: element.id }))
  }
  return problems
}

const EMPTY_FORM: FormSchema = { version: FORM_SCHEMA_VERSION, questions: [] }

/**
 * A cover or standalone page has no response behind it, so only placement and the fit of its own
 * text can go wrong. Response-bound elements cannot be authored on such a layout and are ignored.
 */
export function inspectStandalonePage(
  pageId: string,
  layout: LayoutRecord,
  locale: Locale = "en"
): PageProblem[] {
  const specification = pageSpecificationForLayout(layout.schema)
  const problemNames = textProblemNames(layout.schema.elements, EMPTY_FORM)
  const problems: PageProblem[] = []
  for (const element of layout.schema.elements) {
    problems.push(...inspectElementPlacement(pageId, element, specification))
    if (element.type !== "static-text") continue
    const runs = textRunsForElement(element, undefined, undefined, "", locale)
    const content = runs.map((run) => run.text).join("\n")
    if (!content.trim()) continue
    const fit = layoutText(
      runs,
      element.geometry.width,
      element.geometry.height,
      element.text,
      locale
    )
    if (fit.fits && !fit.truncated) continue
    problems.push(
      problem(
        pageId,
        "text-overflow",
        textOverflowMessage(
          problemNames.get(element.id)!,
          layout.name,
          element.text.overflow,
          fit,
          element.geometry.height
        ),
        !fit.fits,
        { elementId: element.id }
      )
    )
  }
  return problems
}

export function inspectSubmissionPage(
  pageId: string,
  layout: LayoutRecord,
  submission: SubmissionSummary,
  form: FormSchema,
  resolutionOverrides: string[],
  locale: Locale = "en"
): PageProblem[] {
  const problems: PageProblem[] = []
  const overrides = new Set(resolutionOverrides)
  const assignment = assignPhotosToFrames(layout.schema.elements, submission.answers)
  const problemNames = textProblemNames(layout.schema.elements, form)
  const requiredQuestions = new Map(
    form.questions
      .filter((question) => question.required)
      .map((question) => [question.id, question])
  )
  const pageSpecification = pageSpecificationForLayout(layout.schema)

  for (const element of layout.schema.elements) {
    problems.push(...inspectElementPlacement(pageId, element, pageSpecification))

    if (element.type === "bound-text" || element.type === "static-text") {
      const question =
        element.type === "bound-text"
          ? form.questions.find((candidate) => candidate.id === element.questionId)
          : undefined
      const answer =
        element.type === "bound-text" ? submission.answers[element.questionId] : undefined
      const runs = textRunsForElement(element, question, answer, "", locale)
      const content = runs.map((run) => run.text).join("\n")
      if (
        element.type === "bound-text" &&
        requiredQuestions.has(element.questionId) &&
        (typeof answer === "string"
          ? !answer.trim()
          : !Array.isArray(answer) || answer.length === 0)
      ) {
        problems.push(
          problem(pageId, "missing-required-answer", {}, true, { elementId: element.id })
        )
      }
      if (!content.trim()) continue
      const fit = layoutText(
        runs,
        element.geometry.width,
        element.geometry.height,
        element.text,
        locale
      )
      if (!fit.fits || fit.truncated) {
        problems.push(
          problem(
            pageId,
            "text-overflow",
            textOverflowMessage(
              problemNames.get(element.id)!,
              submission.sequence,
              element.text.overflow,
              fit,
              element.geometry.height
            ),
            !fit.fits,
            { elementId: element.id }
          )
        )
      }
      continue
    }

    if (isPhotoFrame(element)) {
      const slots = frameSlots(element)
      framePhotos(assignment, element.id).forEach((image, index) => {
        if (!image) return
        if (image.mimeType !== "image/jpeg" && image.mimeType !== "image/png") {
          problems.push(
            problem(pageId, "unsupported-asset", { name: image.name }, true, {
              elementId: element.id,
              assetId: image.assetId,
            })
          )
          return
        }
        const slot = slots[index]!
        const ppi = effectivePpi(image.width, image.height, slot.width, slot.height)
        if (ppi < 150 && !overrides.has(image.assetId)) {
          problems.push(
            problem(pageId, "image-blocking-resolution", { name: image.name, ppi }, true, {
              elementId: element.id,
              assetId: image.assetId,
            })
          )
        } else if (ppi < 300) {
          problems.push(
            problem(pageId, "image-low-resolution", { name: image.name, ppi }, false, {
              elementId: element.id,
              assetId: image.assetId,
            })
          )
        }
      })
    }
  }

  for (const question of assignment.questions) {
    if (question.unplacedPhotoCount === 0 && question.emptySlotCount === 0) continue
    const prompt =
      form.questions.find((candidate) => candidate.id === question.questionId)?.prompt ?? ""
    problems.push(
      problem(
        pageId,
        "photo-slot-mismatch",
        {
          prompt,
          response: submission.sequence,
          slotCount: question.slotCount,
          photoCount: question.photoCount,
          unplacedPhotoCount: question.unplacedPhotoCount,
          emptySlotCount: question.emptySlotCount,
        },
        false,
        { key: question.questionId }
      )
    )
  }
  return problems
}

export interface BookPageIssue {
  pageId: string
  reason: string
}

/**
 * Rejects page sets a client must never be able to persist: a response page on a layout that
 * generation would not assign, a standalone page on a response layout (generation drops it on the
 * next run), a duplicated cover, or a page introduced with a layout the project does not own.
 *
 * A page that already exists in the stored book keeps its layout even when that layout is gone:
 * deleting a layout deliberately leaves the stale book referencing it until it is regenerated.
 */
export function invalidBookPages(
  pages: BookPage[],
  layouts: LayoutRecord[],
  storedPageIds: ReadonlySet<string>
): BookPageIssue[] {
  const layoutById = new Map(layouts.map((layout) => [layout.id, layout]))
  const issues: BookPageIssue[] = []
  const coverPageCounts = new Map<string, number>()
  for (const page of pages) {
    const layout = layoutById.get(page.layoutId)
    if (!layout) {
      if (!storedPageIds.has(page.id)) {
        issues.push({ pageId: page.id, reason: "references a layout this project does not own" })
      }
      continue
    }
    if (page.kind === "submission" && layout.role !== "submission") {
      issues.push({ pageId: page.id, reason: "is a response page on a non-response layout" })
      continue
    }
    if (page.kind === "standalone" && layout.role === "submission") {
      issues.push({ pageId: page.id, reason: "is a standalone page on a response layout" })
      continue
    }
    if (!isCoverRole(layout.role)) continue
    const seen = (coverPageCounts.get(layout.id) ?? 0) + 1
    coverPageCounts.set(layout.id, seen)
    if (seen > 1) {
      issues.push({ pageId: page.id, reason: "duplicates a cover page" })
    }
  }
  return issues
}

/**
 * Restores the pinned order after pages were rearranged: the front-cover page first, the
 * back-cover page last, every other page in the order it was given.
 */
export function pinCoverPages(pages: BookPage[], layouts: LayoutRecord[]): BookPage[] {
  const roleByLayoutId = new Map(layouts.map((layout) => [layout.id, layout.role]))
  const roleOf = (page: BookPage) =>
    page.kind === "standalone" ? roleByLayoutId.get(page.layoutId) : undefined
  return [
    ...pages.filter((page) => roleOf(page) === "front-cover"),
    ...pages.filter((page) => !isCoverRole(roleOf(page) ?? "submission")),
    ...pages.filter((page) => roleOf(page) === "back-cover"),
  ]
}

/** The pinned page for a cover role, or nothing when the project has no such layout. */
function coverPages(
  layouts: LayoutRecord[],
  role: "front-cover" | "back-cover",
  locale: Locale = "en"
): BookPage[] {
  const layout = findLayoutByRole(layouts, role)
  if (!layout) return []
  const id = `standalone:${layout.id}`
  return [
    {
      id,
      kind: "standalone",
      layoutId: layout.id,
      problems: inspectStandalonePage(id, layout, locale),
    },
  ]
}

export function generateBook(input: {
  locale?: Locale
  projectId: string
  form: FormSchema
  submissions: SubmissionSummary[]
  layouts: LayoutRecord[]
  settings: GenerationSettings
  previousBook?: GeneratedBook | null
  now?: string
}): GeneratedBook {
  if (input.layouts.length === 0) {
    throw new Error(m.ui_create_at_least_one_layout_before_generating_the_book())
  }
  const submissions = [...input.submissions].sort((left, right) => left.sequence - right.sequence)
  const layouts = [...input.layouts].sort((left, right) => left.position - right.position)
  const responses = responseLayouts(layouts)
  if (submissions.length > 0 && responses.length === 0) {
    throw new Error(m.ui_create_at_least_one_response_layout_before_generating_the_book())
  }
  const assignments = deterministicLayoutAssignments(submissions, layouts, input.settings)
  const layoutById = new Map(layouts.map((layout) => [layout.id, layout]))

  const submissionPages: SubmissionBookPage[] = submissions.map((submission) => {
    const id = `submission:${submission.id}`
    const layoutId = assignments[submission.id]!
    const layout = layoutById.get(layoutId)!
    return {
      id,
      kind: "submission",
      submissionId: submission.id,
      layoutId,
      problems: inspectSubmissionPage(
        id,
        layout,
        submission,
        input.form,
        input.settings.resolutionOverrides,
        input.locale
      ),
    }
  })

  // Standalone pages survive regeneration, but only while the layout behind them still exists.
  const standalonePages: StandaloneBookPage[] = (input.previousBook?.pages ?? []).flatMap(
    (page) => {
      if (page.kind !== "standalone") return []
      const layout = layoutById.get(page.layoutId)
      if (!layout || layout.role !== "static") return []
      return [{ ...page, problems: inspectStandalonePage(page.id, layout, input.locale) }]
    }
  )
  const bodyPages: BookPage[] = [...submissionPages, ...standalonePages]
  const previousOrder = new Map(
    input.previousBook?.pages.map((page, index) => [page.id, index]) ?? []
  )
  bodyPages.sort((left, right) => {
    const leftIndex = previousOrder.get(left.id)
    const rightIndex = previousOrder.get(right.id)
    if (leftIndex === undefined && rightIndex === undefined) return 0
    if (leftIndex === undefined) return 1
    if (rightIndex === undefined) return -1
    return leftIndex - rightIndex
  })

  const allPages: BookPage[] = [
    ...coverPages(layouts, "front-cover", input.locale),
    ...bodyPages,
    ...coverPages(layouts, "back-cover", input.locale),
  ]

  const now = input.now ?? new Date().toISOString()
  const sourceFingerprint = fingerprintBookSource({
    locale: input.locale ?? "en",
    layoutEngineVersion: 1,
    submissions,
    layouts,
    settings: input.settings,
    pages: allPages,
  })
  return {
    layoutEngineVersion: 1,
    projectId: input.projectId,
    settings: input.settings,
    pages: allPages,
    sourceFingerprint,
    generatedAt: now,
    updatedAt: now,
  }
}

export function fingerprintBookSource(value: unknown): string {
  const canonical = JSON.stringify(value, (_key, item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      )
    }
    return item
  })
  return hashString(canonical).toString(16).padStart(8, "0")
}

export function blockingProblems(book: GeneratedBook): PageProblem[] {
  return book.pages.flatMap((page) => page.problems.filter((item) => item.blocking))
}
