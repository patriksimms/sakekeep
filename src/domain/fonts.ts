/**
 * Every font the layout editor offers, in one place. The browser preview, the
 * generated layout metrics, and the embedded PDF cuts all resolve through this
 * registry so a family can never render one way on screen and another in print.
 *
 * `cssFamily` must match a face declared in `src/styles.css`; `cuts` map a
 * style/weight pair onto a static instance under `assets/fonts`. Rebuild the
 * instances with `bun run fonts:build` and the metrics with `bun run fonts:metrics`.
 */
import { type FontStyle, type FontWeight } from "./types.ts"

/** Static instances embedded by the PDF renderer and measured for line breaking. */
export const FONT_CUT_FILES = {
  "Inter-Regular": "assets/fonts/Inter-Regular.ttf",
  "Inter-Bold": "assets/fonts/Inter-Bold.ttf",
  "Inter-Italic": "assets/fonts/Inter-Italic.ttf",
  "Inter-BoldItalic": "assets/fonts/Inter-BoldItalic.ttf",
  "SourceSerif4-Regular": "assets/fonts/SourceSerif4-Regular-Print.ttf",
  "SourceSerif4-Bold": "assets/fonts/SourceSerif4-Bold-Print.ttf",
  "SourceSerif4-Italic": "assets/fonts/SourceSerif4-Italic-Print.ttf",
  "SourceSerif4-BoldItalic": "assets/fonts/SourceSerif4-BoldItalic-Print.ttf",
  "Lora-Regular": "assets/fonts/Lora-Regular-Print.ttf",
  "Lora-Bold": "assets/fonts/Lora-Bold-Print.ttf",
  "Lora-Italic": "assets/fonts/Lora-Italic-Print.ttf",
  "Lora-BoldItalic": "assets/fonts/Lora-BoldItalic-Print.ttf",
  "EBGaramond-Regular": "assets/fonts/EBGaramond-Regular-Print.ttf",
  "EBGaramond-Bold": "assets/fonts/EBGaramond-Bold-Print.ttf",
  "EBGaramond-Italic": "assets/fonts/EBGaramond-Italic-Print.ttf",
  "EBGaramond-BoldItalic": "assets/fonts/EBGaramond-BoldItalic-Print.ttf",
  "PlayfairDisplay-Regular": "assets/fonts/PlayfairDisplay-Regular-Print.ttf",
  "PlayfairDisplay-Bold": "assets/fonts/PlayfairDisplay-Bold-Print.ttf",
  "PlayfairDisplay-Italic": "assets/fonts/PlayfairDisplay-Italic-Print.ttf",
  "PlayfairDisplay-BoldItalic": "assets/fonts/PlayfairDisplay-BoldItalic-Print.ttf",
  "Montserrat-Regular": "assets/fonts/Montserrat-Regular-Print.ttf",
  "Montserrat-Bold": "assets/fonts/Montserrat-Bold-Print.ttf",
  "Montserrat-Italic": "assets/fonts/Montserrat-Italic-Print.ttf",
  "Montserrat-BoldItalic": "assets/fonts/Montserrat-BoldItalic-Print.ttf",
  "Nunito-Regular": "assets/fonts/Nunito-Regular-Print.ttf",
  "Nunito-Bold": "assets/fonts/Nunito-Bold-Print.ttf",
  "Nunito-Italic": "assets/fonts/Nunito-Italic-Print.ttf",
  "Nunito-BoldItalic": "assets/fonts/Nunito-BoldItalic-Print.ttf",
  "Caveat-Regular": "assets/fonts/Caveat-Regular-Print.ttf",
  "Caveat-Bold": "assets/fonts/Caveat-Bold-Print.ttf",
} as const

export type FontCut = keyof typeof FONT_CUT_FILES

export type FontCutKey = `${FontStyle}-${FontWeight}`

export interface FontFamilyDefinition {
  cssFamily: string
  category: "Sans" | "Serif" | "Handwriting"
  /** False when the family ships no italic program and italic renders upright. */
  hasItalic: boolean
  cuts: Record<FontCutKey, FontCut>
}

function cuts(regular: FontCut, bold: FontCut, italic: FontCut, boldItalic: FontCut) {
  return {
    "normal-normal": regular,
    "normal-bold": bold,
    "italic-normal": italic,
    "italic-bold": boldItalic,
  } satisfies Record<FontCutKey, FontCut>
}

export const FONT_FAMILIES = {
  Inter: {
    cssFamily: "Inter Variable",
    category: "Sans",
    hasItalic: true,
    cuts: cuts("Inter-Regular", "Inter-Bold", "Inter-Italic", "Inter-BoldItalic"),
  },
  Montserrat: {
    cssFamily: "Montserrat",
    category: "Sans",
    hasItalic: true,
    cuts: cuts(
      "Montserrat-Regular",
      "Montserrat-Bold",
      "Montserrat-Italic",
      "Montserrat-BoldItalic"
    ),
  },
  Nunito: {
    cssFamily: "Nunito",
    category: "Sans",
    hasItalic: true,
    cuts: cuts("Nunito-Regular", "Nunito-Bold", "Nunito-Italic", "Nunito-BoldItalic"),
  },
  "Source Serif 4": {
    cssFamily: "Source Serif 4 Variable",
    category: "Serif",
    hasItalic: true,
    cuts: cuts(
      "SourceSerif4-Regular",
      "SourceSerif4-Bold",
      "SourceSerif4-Italic",
      "SourceSerif4-BoldItalic"
    ),
  },
  Lora: {
    cssFamily: "Lora",
    category: "Serif",
    hasItalic: true,
    cuts: cuts("Lora-Regular", "Lora-Bold", "Lora-Italic", "Lora-BoldItalic"),
  },
  "EB Garamond": {
    cssFamily: "EB Garamond",
    category: "Serif",
    hasItalic: true,
    cuts: cuts(
      "EBGaramond-Regular",
      "EBGaramond-Bold",
      "EBGaramond-Italic",
      "EBGaramond-BoldItalic"
    ),
  },
  "Playfair Display": {
    cssFamily: "Playfair Display",
    category: "Serif",
    hasItalic: true,
    cuts: cuts(
      "PlayfairDisplay-Regular",
      "PlayfairDisplay-Bold",
      "PlayfairDisplay-Italic",
      "PlayfairDisplay-BoldItalic"
    ),
  },
  Caveat: {
    cssFamily: "Caveat",
    category: "Handwriting",
    hasItalic: false,
    // Caveat has no italic program upstream, so italic reuses the upright cuts
    // and the editor hides the italic option for this family.
    cuts: cuts("Caveat-Regular", "Caveat-Bold", "Caveat-Regular", "Caveat-Bold"),
  },
} as const satisfies Record<string, FontFamilyDefinition>

export type FontFamily = keyof typeof FONT_FAMILIES

export const FONT_FAMILY_IDS = Object.keys(FONT_FAMILIES) as [FontFamily, ...FontFamily[]]

/** Families grouped for the picker, keeping the registry order within a group. */
export const FONT_FAMILY_GROUPS = (["Sans", "Serif", "Handwriting"] as const).map((category) => ({
  category,
  families: FONT_FAMILY_IDS.filter((family) => FONT_FAMILIES[family].category === category),
}))

/** Resolves the static cut used for a family in the given style and weight. */
export function fontCut(family: FontFamily, style: FontStyle, weight: FontWeight): FontCut {
  return FONT_FAMILIES[family].cuts[`${style}-${weight}`]
}

/** Browser font stack for a family, falling back to the category default. */
export function cssFontStack(family: FontFamily): string {
  const definition = FONT_FAMILIES[family]
  const fallback =
    definition.category === "Sans"
      ? "sans-serif"
      : definition.category === "Handwriting"
        ? "cursive"
        : "serif"
  return `"${definition.cssFamily}", ${fallback}`
}
