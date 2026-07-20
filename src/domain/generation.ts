import {
  type BookPage,
  type FormSchema,
  type GeneratedBook,
  type GenerationSettings,
  type ImageAnswer,
  type LayoutElement,
  type LayoutRecord,
  type PageProblem,
  type SubmissionAnswers,
  type SubmissionBookPage,
  type SubmissionSummary,
} from "./types"
import { elementExtendsBeyondBleed, gallerySlots, isCriticalElementOutsideSafeArea } from "./layout"

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

export function deterministicLayoutAssignments(
  submissions: SubmissionSummary[],
  layouts: LayoutRecord[],
  settings: GenerationSettings
): Record<string, string> {
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

export interface TextFit {
  fits: boolean
  effectiveFontSize: number
  truncated: boolean
}

export function fitText(
  content: string,
  widthMm: number,
  heightMm: number,
  fontSize: number,
  minFontSize: number,
  lineHeight: number,
  policy: "shrink" | "truncate" | "flag"
): TextFit {
  const normalize = content.replace(/\r\n/g, "\n")
  const fitsAt = (size: number) => {
    const averageGlyphWidthMm = size * 0.3528 * 0.52
    const charsPerLine = Math.max(1, Math.floor(widthMm / averageGlyphWidthMm))
    const explicitLines = normalize.split("\n")
    const wrappedLines = explicitLines.reduce(
      (count, line) => count + Math.max(1, Math.ceil(line.length / charsPerLine)),
      0
    )
    const lineHeightMm = size * 0.3528 * lineHeight
    return wrappedLines * lineHeightMm <= heightMm
  }

  if (fitsAt(fontSize)) {
    return { fits: true, effectiveFontSize: fontSize, truncated: false }
  }
  if (policy === "shrink") {
    for (let size = fontSize - 0.5; size >= minFontSize; size -= 0.5) {
      if (fitsAt(size)) {
        return { fits: true, effectiveFontSize: size, truncated: false }
      }
    }
  }
  return {
    fits: policy === "truncate",
    effectiveFontSize: policy === "shrink" ? minFontSize : fontSize,
    truncated: policy === "truncate",
  }
}

function textForElement(
  element: Extract<LayoutElement, { type: "bound-text" | "static-text" }>,
  answers: SubmissionAnswers
): string {
  if (element.type === "static-text") return element.content
  const answer = answers[element.questionId]
  if (typeof answer !== "string") return ""
  const label = element.showLabel
    ? `${element.label?.trim() || ""}${element.label?.trim() ? "\n" : ""}`
    : ""
  return `${label}${answer}`
}

function imagesForElement(
  element: Extract<LayoutElement, { type: "image-frame" | "gallery-frame" }>,
  answers: SubmissionAnswers
): ImageAnswer[] {
  const answer = answers[element.questionId]
  if (!Array.isArray(answer)) return []
  return answer.filter(
    (item): item is ImageAnswer =>
      typeof item === "object" && item !== null && "assetId" in item && "width" in item
  )
}

function problem(
  pageId: string,
  code: PageProblem["code"],
  message: string,
  blocking: boolean,
  elementId?: string,
  assetId?: string
): PageProblem {
  return {
    id: `${pageId}:${elementId ?? "page"}:${assetId ?? code}:${code}`,
    code,
    pageId,
    elementId,
    assetId,
    message,
    blocking,
  }
}

export function inspectSubmissionPage(
  pageId: string,
  layout: LayoutRecord,
  submission: SubmissionSummary,
  form: FormSchema,
  resolutionOverrides: string[]
): PageProblem[] {
  const problems: PageProblem[] = []
  const overrides = new Set(resolutionOverrides)
  const requiredQuestions = new Map(
    form.questions
      .filter((question) => question.required)
      .map((question) => [question.id, question])
  )

  for (const element of layout.schema.elements) {
    if (elementExtendsBeyondBleed(element)) {
      problems.push(
        problem(
          pageId,
          "outside-print-area",
          "An element extends beyond the 3 mm bleed boundary.",
          true,
          element.id
        )
      )
    } else if (isCriticalElementOutsideSafeArea(element)) {
      problems.push(
        problem(
          pageId,
          "outside-print-area",
          "Text or critical content is outside the 6 mm safe area.",
          true,
          element.id
        )
      )
    }

    if (element.type === "bound-text" || element.type === "static-text") {
      const content = textForElement(element, submission.answers)
      if (
        element.type === "bound-text" &&
        requiredQuestions.has(element.questionId) &&
        !content.trim()
      ) {
        problems.push(
          problem(
            pageId,
            "missing-required-answer",
            "A required answer used by this layout is missing.",
            true,
            element.id
          )
        )
      }
      if (!content.trim()) continue
      const fit = fitText(
        content,
        element.geometry.width,
        element.geometry.height,
        element.text.fontSize,
        element.text.minFontSize,
        element.text.lineHeight,
        element.text.overflow
      )
      if (!fit.fits) {
        problems.push(
          problem(
            pageId,
            "text-overflow",
            "Text does not fit at the configured minimum size.",
            true,
            element.id
          )
        )
      }
      continue
    }

    if (element.type === "image-frame" || element.type === "gallery-frame") {
      const images = imagesForElement(element, submission.answers)
      if (images.length === 0) continue
      const slots =
        element.type === "image-frame"
          ? [
              {
                width: element.geometry.width,
                height: element.geometry.height,
              },
            ]
          : gallerySlots(
              element.arrangement,
              element.geometry.width,
              element.geometry.height,
              element.gap
            )
      if (images.length > slots.length) {
        problems.push(
          problem(
            pageId,
            "gallery-overflow",
            `${images.length - slots.length} image(s) do not fit in the configured gallery.`,
            true,
            element.id
          )
        )
      }
      images.slice(0, slots.length).forEach((image, index) => {
        if (image.mimeType !== "image/jpeg" && image.mimeType !== "image/png") {
          problems.push(
            problem(
              pageId,
              "unsupported-asset",
              `${image.name} is not a supported print-master format.`,
              true,
              element.id,
              image.assetId
            )
          )
          return
        }
        const slot = slots[index]!
        const ppi = effectivePpi(image.width, image.height, slot.width, slot.height)
        if (ppi < 150 && !overrides.has(image.assetId)) {
          problems.push(
            problem(
              pageId,
              "image-blocking-resolution",
              `${image.name} has ${ppi} effective PPI; at least 150 PPI or an explicit override is required.`,
              true,
              element.id,
              image.assetId
            )
          )
        } else if (ppi < 300) {
          problems.push(
            problem(
              pageId,
              "image-low-resolution",
              `${image.name} has ${ppi} effective PPI; 300 PPI is recommended.`,
              false,
              element.id,
              image.assetId
            )
          )
        }
      })
    }
  }
  return problems
}

export function generateBook(input: {
  projectId: string
  form: FormSchema
  submissions: SubmissionSummary[]
  layouts: LayoutRecord[]
  settings: GenerationSettings
  previousBook?: GeneratedBook | null
  now?: string
}): GeneratedBook {
  if (input.layouts.length === 0) {
    throw new Error("Create at least one layout before generating the book.")
  }
  const submissions = [...input.submissions].sort((left, right) => left.sequence - right.sequence)
  const layouts = [...input.layouts].sort((left, right) => left.position - right.position)
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
        input.settings.resolutionOverrides
      ),
    }
  })

  const standalonePages =
    input.previousBook?.pages.filter((page) => page.kind === "standalone") ?? []
  const allPages: BookPage[] = [...submissionPages, ...standalonePages]
  const previousOrder = new Map(
    input.previousBook?.pages.map((page, index) => [page.id, index]) ?? []
  )
  allPages.sort((left, right) => {
    const leftIndex = previousOrder.get(left.id)
    const rightIndex = previousOrder.get(right.id)
    if (leftIndex === undefined && rightIndex === undefined) return 0
    if (leftIndex === undefined) return 1
    if (rightIndex === undefined) return -1
    return leftIndex - rightIndex
  })

  const now = input.now ?? new Date().toISOString()
  const sourceFingerprint = fingerprintBookSource({
    submissions,
    layouts,
    settings: input.settings,
    pages: allPages,
  })
  return {
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
