import { type Locale } from "#/lib/locale.ts"
import germanHyphenation from "hyphen/de-1996"
import * as m from "#/paraglide/messages.js"
import { FONT_METRICS } from "./font-metrics.generated.ts"
import { fontCut } from "./fonts.ts"
import { POINT_TO_MM } from "./layout-rendering.ts"
import {
  type FontWeight,
  type FormQuestion,
  type LayoutElement,
  type OverflowPolicy,
  type SubmissionAnswer,
  type TextSettings,
} from "./types.ts"

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
  /** Distance from the top of the box to the first rendered line, per the vertical alignment. */
  offsetYMm: number
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
  answerPlaceholder = "",
  locale: Locale = "en"
): TextLayoutRun[] {
  if (element.type === "static-text") return [{ text: element.content }]
  const value = answer === undefined ? answerPlaceholder : answerText(answer, question)
  const label = element.showLabel
    ? element.label?.trim() || question?.prompt || m.question({}, { locale })
    : ""
  return [...(label ? [{ text: label, fontWeight: "bold" as const }] : []), { text: value }]
}

function textWidthMm(text: string, settings: TextSettings, weight: FontWeight, size: number) {
  const metrics = FONT_METRICS[fontCut(settings.fontFamily, settings.fontStyle, weight)]
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
  widthMm: number,
  locale: Locale
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
        if (textWidthMm(candidate, settings, weight, size) <= widthMm) {
          line = candidate
        } else {
          // Choose the last German syllable boundary that fits. The actual hyphen becomes
          // part of the shared line, so the browser and PDF draw identical text.
          let remainder = word
          if (locale === "de") {
            const parts = germanHyphenation.hyphenateSync(word).split("\u00ad")
            while (parts.length > 1) {
              let fitting = 0
              for (let end = 1; end < parts.length; end += 1) {
                const prefix = `${line ? `${line} ` : ""}${parts.slice(0, end).join("")}-`
                if (textWidthMm(prefix, settings, weight, size) <= widthMm) fitting = end
              }
              if (!fitting) {
                if (!line) break
                lines.push({
                  text: line,
                  fontWeight: weight,
                  widthMm: textWidthMm(line, settings, weight, size),
                })
                line = ""
                continue
              }
              const prefix = `${line ? `${line} ` : ""}${parts.splice(0, fitting).join("")}-`
              lines.push({
                text: prefix,
                fontWeight: weight,
                widthMm: textWidthMm(prefix, settings, weight, size),
              })
              line = ""
              if (textWidthMm(parts.join(""), settings, weight, size) <= widthMm) break
            }
            remainder = parts.join("")
          }
          if (!line) {
            line = remainder
            continue
          }
          lines.push({
            text: line,
            fontWeight: weight,
            widthMm: textWidthMm(line, settings, weight, size),
          })
          line = remainder
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

function verticalOffsetMm(
  settings: TextSettings,
  boxHeightMm: number,
  renderedHeightMm: number
): number {
  // minimumTextBoxHeight measures against an unbounded box; there is no slack to distribute.
  if (!Number.isFinite(boxHeightMm)) return 0
  const slack = boxHeightMm - renderedHeightMm
  // Text taller than its box stays top-anchored: pushing it up or down would only move an
  // already-flagged overflow further off the page.
  if (slack <= 0) return 0
  if (settings.verticalAlignment === "middle") return slack / 2
  if (settings.verticalAlignment === "bottom") return slack
  return 0
}

function layoutAtSize(
  runs: TextLayoutRun[],
  settings: TextSettings,
  size: number,
  widthMm: number,
  heightMm: number,
  locale: Locale
) {
  const lines = wrapRuns(runs, settings, size, widthMm, locale)
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
  settings: TextSettings,
  locale: Locale = "en"
): TextLayoutResult {
  let size = settings.fontSize
  let layout = layoutAtSize(runs, settings, size, widthMm, heightMm, locale)
  if (!layout.fits && settings.overflow === "shrink") {
    for (size = settings.fontSize - 0.5; size >= settings.minFontSize; size -= 0.5) {
      layout = layoutAtSize(runs, settings, size, widthMm, heightMm, locale)
      if (layout.fits) break
    }
    if (size < settings.minFontSize) {
      size = settings.minFontSize
      layout = layoutAtSize(runs, settings, size, widthMm, heightMm, locale)
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
      offsetYMm: verticalOffsetMm(settings, heightMm, layout.lines.length * layout.lineHeightMm),
      fits: true,
      truncated: false,
      requiredHeightMm: layout.requiredHeightMm,
      lineHeightMm: layout.lineHeightMm,
      ...lineCounts,
    }
  }

  if (settings.overflow === "truncate") {
    const maxLines = Math.floor(heightMm / layout.lineHeightMm)
    const truncated = truncateLines(layout.lines, settings, size, widthMm, maxLines)
    return {
      renderedLines: truncated,
      effectiveFontSize: size,
      offsetYMm: verticalOffsetMm(settings, heightMm, truncated.length * layout.lineHeightMm),
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
    offsetYMm: verticalOffsetMm(settings, heightMm, layout.lines.length * layout.lineHeightMm),
    fits: false,
    truncated: false,
    requiredHeightMm: layout.requiredHeightMm,
    lineHeightMm: layout.lineHeightMm,
    ...lineCounts,
  }
}

/**
 * Splits a vertical alignment offset into the page-space components that walk down the box's own
 * rotated axis. The HTML preview gets this for free because its padding lives inside the rotated
 * element; a renderer that positions in page space has to rotate the offset itself.
 */
export function alignmentOffsetMm(
  offsetYMm: number,
  rotationDegrees: number
): { xMm: number; yMm: number } {
  const radians = (rotationDegrees * Math.PI) / 180
  return {
    xMm: -offsetYMm * Math.sin(radians),
    yMm: offsetYMm * Math.cos(radians),
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
  policy: OverflowPolicy = element.text.overflow,
  locale: Locale = "en"
) {
  const size = policy === "shrink" ? element.text.minFontSize : element.text.fontSize
  const runs: TextLayoutRun[] =
    element.type === "bound-text" && element.showLabel
      ? [
          {
            text: labelText?.trim() || element.label?.trim() || m.question({}, { locale }),
            fontWeight: "bold",
          },
          { text: "M" },
        ]
      : [{ text: "M" }]
  return layoutText(
    runs,
    element.geometry.width,
    Number.POSITIVE_INFINITY,
    {
      ...element.text,
      fontSize: size,
      minFontSize: size,
      overflow: "flag",
    },
    locale
  ).requiredHeightMm
}

export function enforceMinimumTextBoxHeight<T extends LayoutElement>(
  element: T,
  labelText?: string,
  locale: Locale = "en"
): T {
  if (element.type !== "bound-text" && element.type !== "static-text") return element
  const minimumHeight = minimumTextBoxHeight(element, labelText, element.text.overflow, locale)
  if (element.geometry.height >= minimumHeight) return element
  return {
    ...element,
    geometry: { ...element.geometry, height: minimumHeight },
  }
}
