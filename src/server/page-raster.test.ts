import sharp from "sharp"
import { describe, expect, it } from "vitest"

import { PAGE_SPEC } from "../domain/layout.ts"
import { RASTER_PPI, renderPageJpegs } from "./page-raster.ts"
import { renderBookPdf } from "./pdf-renderer.ts"
import { completeForm, cycleSettings } from "../test/fixtures.ts"

const standalonePage = (id: string, background: string) => ({
  id,
  kind: "standalone" as const,
  pageType: "cover" as const,
  title: "Stories worth keeping",
  body: "A representative standalone page.",
  background,
  problems: [],
})

describe("page rasterizer", () => {
  it("renders one 300 PPI JPEG per page, bleed included", async () => {
    const pdf = await renderBookPdf({
      book: {
        projectId: "99999999-9999-4999-8999-999999999999",
        settings: cycleSettings,
        pages: [
          standalonePage("standalone:cover", "#fffdf7"),
          standalonePage("standalone:closing", "#dfe8da"),
        ],
        sourceFingerprint: "raster-test",
        generatedAt: "2026-08-29T00:00:00.000Z",
        updatedAt: "2026-08-29T00:00:00.000Z",
      },
      layouts: [],
      submissions: [],
      form: completeForm,
      marks: false,
    })

    const images = await renderPageJpegs(pdf)

    expect(images).toHaveLength(2)
    const expectedWidth = (PAGE_SPEC.mediaWidthMm / 25.4) * RASTER_PPI
    const expectedHeight = (PAGE_SPEC.mediaHeightMm / 25.4) * RASTER_PPI
    for (const image of images) {
      const metadata = await sharp(image).metadata()
      expect(metadata.format).toBe("jpeg")
      expect(metadata.density).toBe(RASTER_PPI)
      // pdfium rounds the pixel box, so allow the page to land a few pixels off.
      expect(Math.abs((metadata.width ?? 0) - expectedWidth)).toBeLessThan(6)
      expect(Math.abs((metadata.height ?? 0) - expectedHeight)).toBeLessThan(6)
    }
    // Different page backgrounds must not produce identical rasters.
    expect(Buffer.from(images[0]!).equals(Buffer.from(images[1]!))).toBe(false)
  })
})
