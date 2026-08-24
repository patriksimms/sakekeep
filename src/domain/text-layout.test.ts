import { describe, expect, it } from "vitest"

import { DEFAULT_TEXT_SETTINGS } from "./layout.ts"
import {
  alignmentOffsetMm,
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

  it("tests the exact decimal minimum after stepped shrink candidates", () => {
    const result = layoutText([{ text: "One line" }], 100, 2.9, {
      ...DEFAULT_TEXT_SETTINGS,
      fontSize: 20,
      minFontSize: 8.1,
      lineHeight: 1,
      overflow: "shrink",
    })

    expect(result).toMatchObject({
      fits: true,
      effectiveFontSize: 8.1,
      requiredLines: 1,
      availableLines: 1,
    })
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

  it("treats wholly empty content as zero lines in every consumer", () => {
    const result = layoutText([{ text: "  \n " }], 30, 1, DEFAULT_TEXT_SETTINGS)

    expect(result).toMatchObject({
      renderedLines: [],
      fits: true,
      requiredHeightMm: 0,
    })
  })

  it("distributes the slack left in the box according to the vertical alignment", () => {
    const line = [{ text: "One line" }]
    const at = (verticalAlignment: "top" | "middle" | "bottom") =>
      layoutText(line, 100, 40, { ...DEFAULT_TEXT_SETTINGS, verticalAlignment })

    const rendered = at("top").renderedLines.length * at("top").lineHeightMm
    const slack = 40 - rendered

    expect(slack).toBeGreaterThan(0)
    expect(at("top").offsetYMm).toBe(0)
    expect(at("middle").offsetYMm).toBeCloseTo(slack / 2, 10)
    expect(at("bottom").offsetYMm).toBeCloseTo(slack, 10)
  })

  it("keeps overflowing text top-anchored instead of pushing it off the page", () => {
    const content = [{ text: "A memory with enough words to wrap onto several lines" }]

    for (const verticalAlignment of ["top", "middle", "bottom"] as const) {
      const flagged = layoutText(content, 30, 8, {
        ...DEFAULT_TEXT_SETTINGS,
        overflow: "flag",
        verticalAlignment,
      })

      expect(flagged.fits).toBe(false)
      expect(flagged.offsetYMm).toBe(0)
    }
  })

  it("offsets by the slack remaining after shrinking, not before", () => {
    const settings = {
      ...DEFAULT_TEXT_SETTINGS,
      fontSize: 20,
      minFontSize: 8,
      overflow: "shrink" as const,
      verticalAlignment: "bottom" as const,
    }
    const result = layoutText([{ text: "A memory that needs some room" }], 35, 12, settings)

    expect(result.fits).toBe(true)
    expect(result.effectiveFontSize).toBeLessThan(20)
    expect(result.offsetYMm).toBeCloseTo(12 - result.requiredHeightMm, 10)
  })

  it("centres the lines that survive truncation rather than the ones it dropped", () => {
    const result = layoutText(
      [{ text: "A memory with enough words to wrap onto several lines" }],
      30,
      8,
      {
        ...DEFAULT_TEXT_SETTINGS,
        overflow: "truncate",
        verticalAlignment: "middle",
      }
    )

    expect(result.truncated).toBe(true)
    const renderedHeight = result.renderedLines.length * result.lineHeightMm
    expect(renderedHeight).toBeLessThanOrEqual(8)
    expect(result.offsetYMm).toBeCloseTo((8 - renderedHeight) / 2, 10)
  })

  it("has no slack to distribute when the box height is unbounded", () => {
    const result = layoutText([{ text: "One line" }], 100, Number.POSITIVE_INFINITY, {
      ...DEFAULT_TEXT_SETTINGS,
      verticalAlignment: "bottom",
    })

    expect(result.offsetYMm).toBe(0)
    expect(
      minimumTextBoxHeight({
        ...staticText,
        text: { ...staticText.text, verticalAlignment: "bottom" },
      })
    ).toBeCloseTo(minimumTextBoxHeight(staticText), 10)
  })

  it("walks the alignment offset down the box's own axis when it is rotated", () => {
    const upright = alignmentOffsetMm(10, 0)
    expect(upright.xMm).toBeCloseTo(0, 10)
    expect(upright.yMm).toBeCloseTo(10, 10)

    const quarterTurn = alignmentOffsetMm(10, 90)
    expect(quarterTurn.xMm).toBeCloseTo(-10, 10)
    expect(quarterTurn.yMm).toBeCloseTo(0, 10)

    const tilted = alignmentOffsetMm(52.944, 20)
    expect(tilted.xMm).toBeCloseTo(-52.944 * Math.sin((20 * Math.PI) / 180), 10)
    expect(tilted.yMm).toBeCloseTo(52.944 * Math.cos((20 * Math.PI) / 180), 10)
    // The offset only ever moves along the box, never along it lengthwise.
    expect(Math.hypot(tilted.xMm, tilted.yMm)).toBeCloseTo(52.944, 10)
  })

  it("leaves top-aligned text untouched at every rotation, so stored layouts do not move", () => {
    for (const rotation of [0, 7, -13, 90, 180]) {
      const offset = alignmentOffsetMm(0, rotation)
      expect(offset.xMm, `x at ${rotation} degrees`).toBeCloseTo(0, 10)
      expect(offset.yMm, `y at ${rotation} degrees`).toBeCloseTo(0, 10)
    }
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

  it("includes every wrapped label line in the labelled-answer height floor", () => {
    const narrow = {
      ...boundText,
      label: "Tell us about your favourite memory from school",
      geometry: { ...boundText.geometry, width: 20, height: 1 },
    }
    const minimum = minimumTextBoxHeight(narrow)
    const promptMinimum = minimumTextBoxHeight(
      { ...narrow, label: undefined },
      "Tell us about your favourite memory from school"
    )

    expect(minimum).toBeGreaterThan(2 * 16 * (25.4 / 72) * 1.25)
    expect(promptMinimum).toBe(minimum)
    expect(enforceMinimumTextBoxHeight(narrow).geometry.height).toBe(minimum)
  })
})
