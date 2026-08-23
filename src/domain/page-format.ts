import { type LayoutSchema, type PageFormat, type PageOrientation } from "./types.ts"

export const PAGE_FORMATS = ["a4", "a5", "a6"] as const satisfies PageFormat[]
export const PAGE_ORIENTATIONS = ["portrait", "landscape"] as const satisfies PageOrientation[]

const PORTRAIT_TRIM_MM: Record<PageFormat, readonly [width: number, height: number]> = {
  a4: [210, 297],
  a5: [148, 210],
  a6: [105, 148],
}

export interface PageSpecification {
  format: PageFormat
  orientation: PageOrientation
  standard: string
  trimWidthMm: number
  trimHeightMm: number
  bleedMm: 3
  safeMarginMm: 6
  mediaWidthMm: number
  mediaHeightMm: number
}

export function pageSpecification(
  format: PageFormat = "a5",
  orientation: PageOrientation = "landscape"
): PageSpecification {
  const portrait = PORTRAIT_TRIM_MM[format]
  const [trimWidthMm, trimHeightMm] =
    orientation === "portrait" ? portrait : [portrait[1], portrait[0]]
  return {
    format,
    orientation,
    standard: `DIN/ISO ${format.toUpperCase()} ${orientation}`,
    trimWidthMm,
    trimHeightMm,
    bleedMm: 3,
    safeMarginMm: 6,
    mediaWidthMm: trimWidthMm + 6,
    mediaHeightMm: trimHeightMm + 6,
  }
}

export function pageSpecificationForLayout(schema: LayoutSchema): PageSpecification {
  for (const format of PAGE_FORMATS) {
    for (const orientation of PAGE_ORIENTATIONS) {
      const specification = pageSpecification(format, orientation)
      if (
        schema.trim.widthMm === specification.trimWidthMm &&
        schema.trim.heightMm === specification.trimHeightMm
      ) {
        return specification
      }
    }
  }
  throw new Error(
    `Unsupported page dimensions: ${schema.trim.widthMm} x ${schema.trim.heightMm} mm.`
  )
}

export function pageFormatLabel(format: PageFormat): string {
  return format.toUpperCase()
}
