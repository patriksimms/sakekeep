import { FONT_METRICS } from "./font-metrics.generated.ts"
import { POINT_TO_MM } from "./layout-rendering.ts"
import {
  type FontWeight,
  type FormQuestion,
  type LayoutElement,
  type OverflowPolicy,
  type SubmissionAnswer,
  type TextSettings,
} from "./types.ts"

type FontKey = keyof typeof FONT_METRICS

export interface TextLayoutRun {
  text: string
  fontWeight?: FontWeight
}

export interface TextLayoutLine {
  text: string
  fontWeight: FontWeight
  widthMm: number
}

export interface TextLayoutResult {
  renderedLines: TextLayoutLine[]
  effectiveFontSize: number
  fits: boolean
  truncated: boolean
  requiredHeightMm: number
  lineHeightMm: number
  requiredLines: number
  availableLines: number
}

function answerText(answer: SubmissionAnswer | undefined, question: FormQuestion | undefined) {
  if (typeof answer === "string") return answer
  if (!Array.isArray(answer) || answer.length === 0 || typeof answer[0] !== "string") return ""
  if (question?.type === "radio" || question?.type === "checkboxes") {
    const labels = new Map(question.choices.map((choice) => [choice.id, choice.label]))
    return answer
      .filter((value): value is string => typeof value === "string")
      .map((value) => labels.get(value) ?? value)
      .join(", ")
  }
  return answer.filter((value): value is string => typeof value === "string").join(", ")
}

export function textRunsForElement(
  element: Extract<LayoutElement, { type: "bound-text" | "static-text" }>,
  question?: FormQuestion,
  answer?: SubmissionAnswer,
  answerPlaceholder = ""
): TextLayoutRun[] {
  if (element.type === "static-text") return [{ text: element.content }]
  const value = answer === undefined ? answerPlaceholder : answerText(answer, question)
  const label = element.showLabel ? element.label?.trim() || question?.prompt || "Question" : ""
  return [...(label ? [{ text: label, fontWeight: "bold" as const }] : []), { text: value }]
}

function fontKey(settings: TextSettings, weight: FontWeight): FontKey {
  return `${settings.fontFamily}-${settings.fontStyle}-${weight}`
}

function textWidthMm(text: string, settings: TextSettings, weight: FontWeight, size: number) {
  const metrics = FONT_METRICS[fontKey(settings, weight)]
  let advance = 0
  for (const character of text) {
    const codePoint = character.codePointAt(0)!
    advance += (metrics.advances as Record<number, number>)[codePoint] ?? metrics.fallbackAdvance
  }
  return (advance / metrics.unitsPerEm) * size * POINT_TO_MM
}

function wrapRuns(
  runs: TextLayoutRun[],
  settings: TextSettings,
  size: number,
  widthMm: number
): TextLayoutLine[] {
  if (!runs.some((run) => run.text.trim())) return []
  const lines: TextLayoutLine[] = []
  for (const run of runs) {
    const weight = run.fontWeight ?? settings.fontWeight
    for (const explicitLine of run.text.replace(/\r\n/g, "\n").split("\n")) {
      const words = explicitLine.split(/\s+/)
      let line = ""
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word
        if (textWidthMm(candidate, settings, weight, size) <= widthMm || !line) {
          line = candidate
        } else {
          lines.push({
            text: line,
            fontWeight: weight,
            widthMm: textWidthMm(line, settings, weight, size),
          })
          line = word
        }
      }
      lines.push({
        text: line,
        fontWeight: weight,
        widthMm: textWidthMm(line, settings, weight, size),
      })
    }
  }
  return lines
}

function layoutAtSize(
  runs: TextLayoutRun[],
  settings: TextSettings,
  size: number,
  widthMm: number,
  heightMm: number
) {
  const lines = wrapRuns(runs, settings, size, widthMm)
  const lineHeightMm = size * POINT_TO_MM * settings.lineHeight
  const requiredHeightMm = lines.length * lineHeightMm
  return {
    lines,
    lineHeightMm,
    requiredHeightMm,
    fits: requiredHeightMm <= heightMm && lines.every((line) => line.widthMm <= widthMm),
  }
}

function truncateLines(
  lines: TextLayoutLine[],
  settings: TextSettings,
  size: number,
  widthMm: number,
  maxLines: number
) {
  if (lines.length <= maxLines && lines.every((line) => line.widthMm <= widthMm)) return lines
  const rendered = lines.slice(0, Math.max(1, maxLines))
  const source = rendered.at(-1)
  if (!source) return rendered
  let text = `${source.text}…`
  while (text.length > 1 && textWidthMm(text, settings, source.fontWeight, size) > widthMm) {
    text = `${text.slice(0, -2)}…`
  }
  rendered[rendered.length - 1] = {
    ...source,
    text,
    widthMm: textWidthMm(text, settings, source.fontWeight, size),
  }
  return rendered
}

export function layoutText(
  runs: TextLayoutRun[],
  widthMm: number,
  heightMm: number,
  settings: TextSettings
): TextLayoutResult {
  let size = settings.fontSize
  let layout = layoutAtSize(runs, settings, size, widthMm, heightMm)
  if (!layout.fits && settings.overflow === "shrink") {
    for (size = settings.fontSize - 0.5; size >= settings.minFontSize; size -= 0.5) {
      layout = layoutAtSize(runs, settings, size, widthMm, heightMm)
      if (layout.fits) break
    }
    if (size < settings.minFontSize) {
      size = settings.minFontSize
      layout = layoutAtSize(runs, settings, size, widthMm, heightMm)
    }
  }

  const lineCounts = {
    requiredLines: layout.lines.length,
    availableLines: Math.floor(heightMm / layout.lineHeightMm),
  }

  if (layout.fits) {
    return {
      renderedLines: layout.lines,
      effectiveFontSize: size,
      fits: true,
      truncated: false,
      requiredHeightMm: layout.requiredHeightMm,
      lineHeightMm: layout.lineHeightMm,
      ...lineCounts,
    }
  }

  if (settings.overflow === "truncate") {
    const maxLines = Math.floor(heightMm / layout.lineHeightMm)
    return {
      renderedLines: truncateLines(layout.lines, settings, size, widthMm, maxLines),
      effectiveFontSize: size,
      fits: true,
      truncated: true,
      requiredHeightMm: layout.requiredHeightMm,
      lineHeightMm: layout.lineHeightMm,
      ...lineCounts,
    }
  }

  return {
    renderedLines: layout.lines,
    effectiveFontSize: size,
    fits: false,
    truncated: false,
    requiredHeightMm: layout.requiredHeightMm,
    lineHeightMm: layout.lineHeightMm,
    ...lineCounts,
  }
}

export function minimumTextBoxHeight(
  element: {
    type: "bound-text" | "static-text"
    geometry: Pick<LayoutElement["geometry"], "width">
    showLabel?: boolean
    label?: string
    text: TextSettings
  },
  labelText?: string,
  policy: OverflowPolicy = element.text.overflow
) {
  const size = policy === "shrink" ? element.text.minFontSize : element.text.fontSize
  const runs: TextLayoutRun[] =
    element.type === "bound-text" && element.showLabel
      ? [
          {
            text: labelText?.trim() || element.label?.trim() || "Question",
            fontWeight: "bold",
          },
          { text: "M" },
        ]
      : [{ text: "M" }]
  return layoutText(runs, element.geometry.width, Number.POSITIVE_INFINITY, {
    ...element.text,
    fontSize: size,
    minFontSize: size,
    overflow: "flag",
  }).requiredHeightMm
}

export function enforceMinimumTextBoxHeight<T extends LayoutElement>(
  element: T,
  labelText?: string
): T {
  if (element.type !== "bound-text" && element.type !== "static-text") return element
  const minimumHeight = minimumTextBoxHeight(element, labelText)
  if (element.geometry.height >= minimumHeight) return element
  return {
    ...element,
    geometry: { ...element.geometry, height: minimumHeight },
  }
}
