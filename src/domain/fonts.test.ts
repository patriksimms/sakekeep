import { existsSync, readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { FONT_METRICS } from "./font-metrics.generated.ts"
import { cssFontStack, FONT_CUT_FILES, FONT_FAMILIES, fontCut, type FontFamily } from "./fonts.ts"

const families = Object.keys(FONT_FAMILIES) as FontFamily[]
const styles = ["normal", "italic"] as const
const weights = ["normal", "bold"] as const
const styleSheet = readFileSync("src/styles.css", "utf8")

describe("font registry", () => {
  it.each(families)("resolves every style and weight of %s to a bundled cut", (family) => {
    for (const style of styles) {
      for (const weight of weights) {
        const cut = fontCut(family, style, weight)
        expect(existsSync(FONT_CUT_FILES[cut]), `${cut} is missing on disk`).toBe(true)
        expect(FONT_METRICS[cut], `${cut} has no generated metrics`).toBeDefined()
      }
    }
  })

  it.each(families)("declares the browser face for %s", (family) => {
    expect(styleSheet).toContain(FONT_FAMILIES[family].cssFamily)
    expect(cssFontStack(family)).toContain(`"${FONT_FAMILIES[family].cssFamily}"`)
  })

  it("renders italic with the upright cut for families without an italic program", () => {
    expect(FONT_FAMILIES.Caveat.hasItalic).toBe(false)
    expect(fontCut("Caveat", "italic", "normal")).toBe(fontCut("Caveat", "normal", "normal"))
    expect(fontCut("Caveat", "italic", "bold")).toBe(fontCut("Caveat", "normal", "bold"))
  })

  it("keeps distinct cuts for families with a real italic program", () => {
    expect(fontCut("Lora", "italic", "normal")).not.toBe(fontCut("Lora", "normal", "normal"))
  })
})
