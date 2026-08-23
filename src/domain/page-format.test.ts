import { describe, expect, it } from "vitest"

import {
  PAGE_FORMATS,
  PAGE_ORIENTATIONS,
  pageSpecification,
  pageSpecificationForLayout,
} from "./page-format.ts"
import { emptyLayoutSchema } from "./layout.ts"

describe("DIN page formats", () => {
  it("provides the standard trim dimensions with fixed bleed and safe margins", () => {
    expect(pageSpecification("a4", "portrait")).toMatchObject({
      trimWidthMm: 210,
      trimHeightMm: 297,
      mediaWidthMm: 216,
      mediaHeightMm: 303,
      bleedMm: 3,
      safeMarginMm: 6,
    })
    expect(pageSpecification("a5", "landscape")).toMatchObject({
      trimWidthMm: 210,
      trimHeightMm: 148,
      mediaWidthMm: 216,
      mediaHeightMm: 154,
    })
    expect(pageSpecification("a6", "landscape")).toMatchObject({
      trimWidthMm: 148,
      trimHeightMm: 105,
      mediaWidthMm: 154,
      mediaHeightMm: 111,
    })
  })

  it("round-trips every supported format through layout trim dimensions", () => {
    for (const format of PAGE_FORMATS) {
      for (const orientation of PAGE_ORIENTATIONS) {
        expect(pageSpecificationForLayout(emptyLayoutSchema(format, orientation))).toMatchObject({
          format,
          orientation,
        })
      }
    }
  })
})
