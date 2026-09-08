import * as m from "#/paraglide/messages.js"
import { PDFiumLibrary } from "@hyzyla/pdfium"
import sharp from "sharp"

import { HttpError } from "./http"

/** Matches the effective resolution the print export already targets for placed photos. */
export const RASTER_PPI = 300
const POINTS_PER_INCH = 72
const JPEG_QUALITY = 90

/**
 * Rasterizes every page of an already rendered book PDF, in page order. The full media box
 * including bleed is rasterized, so a JPEG shows exactly what the PDF page carries. Pages
 * are yielded as they finish: a 300 PPI page is megabytes, so holding a whole book of them
 * would grow the heap with the page count.
 */
export async function* pageJpegs(pdf: Uint8Array, ppi = RASTER_PPI): AsyncGenerator<Uint8Array> {
  const library = await PDFiumLibrary.init()
  try {
    const document = await library.loadDocument(Buffer.from(pdf))
    try {
      for (const page of document.pages()) {
        const rendered = await page.render({
          scale: ppi / POINTS_PER_INCH,
          render: (options) =>
            sharp(options.data, {
              raw: { width: options.width, height: options.height, channels: 4 },
            })
              // Pages always paint their own background, but flattening keeps a partly
              // transparent page from turning black in JPEG.
              .flatten({ background: "#ffffff" })
              .withDensity(ppi)
              .jpeg({ quality: JPEG_QUALITY, chromaSubsampling: "4:4:4" })
              .toBuffer(),
        })
        yield rendered.data
      }
    } finally {
      document.destroy()
    }
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(500, m.raster_failed())
  } finally {
    library.destroy()
  }
}
