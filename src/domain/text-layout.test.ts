import { describe, expect, it } from "vitest"

import { DEFAULT_TEXT_SETTINGS } from "./layout.ts"
import {
  enforceMinimumTextBoxHeight,
  layoutText,
  minimumTextBoxHeight,
  textRunsForElement,
} from "./text-layout.ts"
import { type BoundTextElement, type StaticTextElement } from "./types.ts"

const staticText: StaticTextElement = {
  id: "static",
  type: "static-text",
  geometry: { x: 0, y: 0, width: 70, height: 35, rotation: 0 },
  opacity: 1,
  content: "A little note",
  text: DEFAULT_TEXT_SETTINGS,
}

const boundText: BoundTextElement = {
  id: "bound",
  type: "bound-text",
  geometry: { x: 0, y: 0, width: 70, height: 35, rotation: 0 },
  opacity: 1,
  questionId: "memory",
  showLabel: true,
  label: "A favourite memory",
  text: DEFAULT_TEXT_SETTINGS,
}

describe("canonical text layout", () => {
  it("uses selected font glyph advances when wrapping static text", () => {
    const narrow = layoutText([{ text: "iiii iiii" }], 20, 40, DEFAULT_TEXT_SETTINGS)
    const wide = layoutText([{ text: "WWWW WWWW" }], 20, 40, DEFAULT_TEXT_SETTINGS)

    expect(narrow.renderedLines).toHaveLength(1)
    expect(wide.renderedLines).toHaveLength(2)
    expect(wide.renderedLines.map((line) => line.text)).toEqual(["WWWW", "WWWW"])
  })

  it("lays out a labelled answer as bold label lines followed by answer lines", () => {
    const question = {
      id: "memory",
      prompt: "Original prompt",
      required: true,
      type: "multiline" as const,
    }
    const runs = textRunsForElement(boundText, question, "We laughed all evening.")
    const result = layoutText(runs, 70, 35, boundText.text)

    expect(result.renderedLines.map(({ text, fontWeight }) => ({ text, fontWeight }))).toEqual([
      { text: "A favourite memory", fontWeight: "bold" },
      { text: "We laughed all evening.", fontWeight: "normal" },
    ])
    expect(result.fits).toBe(true)
  })

  it("shrinks to a fitting half-point size without changing the rendered lines afterward", () => {
    const settings = {
      ...DEFAULT_TEXT_SETTINGS,
      fontSize: 20,
      minFontSize: 8,
      overflow: "shrink" as const,
    }
    const result = layoutText([{ text: "A memory that needs some room" }], 35, 12, settings)

    expect(result.fits).toBe(true)
    expect(result.effectiveFontSize).toBeLessThan(20)
    expect(result.effectiveFontSize).toBeGreaterThanOrEqual(8)
    expect(result.renderedLines.length * result.lineHeightMm).toBe(result.requiredHeightMm)
  })

  it("truncates with an ellipsis and flags unresolved overflow", () => {
    const content = [{ text: "A memory with enough words to wrap onto several lines" }]
    const truncated = layoutText(content, 30, 8, {
      ...DEFAULT_TEXT_SETTINGS,
      overflow: "truncate",
    })
    const flagged = layoutText(content, 30, 8, { ...DEFAULT_TEXT_SETTINGS, overflow: "flag" })

    expect(truncated).toMatchObject({ fits: true, truncated: true })
    expect(truncated.renderedLines.at(-1)?.text).toMatch(/…$/)
    expect(flagged).toMatchObject({ fits: false, truncated: false })
    expect(flagged.requiredHeightMm).toBeGreaterThan(8)
  })

  it("enforces one useful static line and separate label and answer lines", () => {
    expect(minimumTextBoxHeight(staticText)).toBeCloseTo(7.0556, 3)
    expect(minimumTextBoxHeight(boundText)).toBeCloseTo(14.1111, 3)
    expect(
      enforceMinimumTextBoxHeight({
        ...boundText,
        geometry: { ...boundText.geometry, height: 1 },
      }).geometry.height
    ).toBeCloseTo(14.1111, 3)
  })
})
