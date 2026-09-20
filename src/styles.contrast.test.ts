import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * Theme colours are the one thing a browser accessibility scan only catches once a state is on
 * screen, and the destructive badge only appears when a book actually has a blocking problem.
 * These checks read the tokens themselves, so a palette change that pushes the badge back under
 * the 4.5:1 minimum fails here instead of in a review nobody ran with problems present.
 */

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8")

/** The `:root` block is the light theme; the `.dark` block overrides it. */
function block(selector: string): string {
  const start = styles.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`No ${selector} block in styles.css.`)
  return styles.slice(start, styles.indexOf("\n}", start))
}

function token(name: string, theme: "light" | "dark"): [number, number, number] {
  const scope = block(theme === "light" ? ":root" : ".dark")
  const match = scope.match(new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)`))
  if (!match) throw new Error(`No ${theme} --${name} in styles.css.`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function srgb([lightness, chroma, hue]: [number, number, number]): [number, number, number] {
  const radians = (hue * Math.PI) / 180
  const a = chroma * Math.cos(radians)
  const b = chroma * Math.sin(radians)
  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ]
  return linear.map((channel) => {
    const clamped = Math.min(1, Math.max(0, channel))
    return clamped > 0.0031308 ? 1.055 * clamped ** (1 / 2.4) - 0.055 : 12.92 * clamped
  }) as [number, number, number]
}

function relativeLuminance(colour: [number, number, number]): number {
  const [red, green, blue] = colour.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ) as [number, number, number]
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(text: [number, number, number], background: [number, number, number]): number {
  const [brighter, darker] = [relativeLuminance(text), relativeLuminance(background)].sort(
    (left, right) => right - left
  ) as [number, number]
  return (brighter + 0.05) / (darker + 0.05)
}

/** What the browser paints for `bg-destructive/<alpha>` sitting on a surface. */
function wash(
  tint: [number, number, number],
  surface: [number, number, number],
  alpha: number
): [number, number, number] {
  return srgb(tint).map(
    (channel, index) => channel * alpha + srgb(surface)[index]! * (1 - alpha)
  ) as [number, number, number]
}

describe("destructive badge contrast", () => {
  // The badge washes --destructive over its surface at these strengths; see badge.tsx.
  const alphaFor = { light: 0.1, dark: 0.2 } as const

  for (const theme of ["light", "dark"] as const) {
    for (const surface of ["card", "background"] as const) {
      it(`reads the blocking badge on the ${theme} ${surface}`, () => {
        const text = srgb(token("destructive-emphasis", theme))
        const behind = wash(token("destructive", theme), token(surface, theme), alphaFor[theme])
        expect(contrast(text, behind)).toBeGreaterThanOrEqual(4.5)
      })
    }
  }
})
