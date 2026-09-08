import * as m from "#/paraglide/messages.js"
import { type Locale } from "#/lib/locale.ts"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { deflateSync } from "node:zlib"

import fontkit from "@pdf-lib/fontkit"
import {
  clip,
  degrees,
  endPath,
  LineCapStyle,
  PDFArray,
  PDFDocument,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFString,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  rotateDegrees,
  translate,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib"

import {
  fillerMotif,
  fillerPalette,
  fillerSeed,
  motifPlacement,
  type FillerPalette,
} from "../domain/filler-art.ts"
import { effectivePpi } from "../domain/generation"
import { FONT_CUT_FILES, fontCut, type FontCut } from "../domain/fonts.ts"
import { gallerySlots, PAGE_SPEC } from "../domain/layout"
import { pageSpecification, type PageSpecification } from "../domain/page-format.ts"
import { effectiveFocalPoint } from "../domain/photo-focus.ts"
import {
  assignPhotosToFrames,
  framePhotos,
  type PhotoAssignment,
} from "../domain/photo-assignment.ts"
import {
  alignmentOffsetMm,
  layoutText,
  textRunsForElement,
  type TextLayoutRun,
} from "../domain/text-layout.ts"
import {
  type BookPage,
  type FormSchema,
  type GeneratedBook,
  type LayoutElement,
  type LayoutRecord,
  type PageFormat,
  type PageOrientation,
  type SubmissionSummary,
  type TextSettings,
} from "../domain/types"
import { HttpError } from "./http"
import { getObject } from "./object-store"
import { getAsset } from "./repository"

const POINTS_PER_MM = 72 / 25.4
// Only the cuts a book actually uses are embedded, so adding families to the
// picker does not grow every exported PDF.
type EmbeddedFonts = Partial<Record<FontCut, PDFFont>>

interface AssetResolutionMetadata {
  assetId: string
  pageId: string
  elementId: string
  pixelWidth: number
  pixelHeight: number
  placedWidthMm: number
  placedHeightMm: number
  effectivePpi: number
}

function embeddedFont(fonts: EmbeddedFonts, cut: FontCut): PDFFont {
  const font = fonts[cut]
  if (!font) throw new HttpError(500, m.missing_font_cut({ value0: cut }))
  return font
}

function pt(mm: number): number {
  return mm * POINTS_PER_MM
}

export function fitSingleLineTextSize(
  preferredSize: number,
  measuredWidth: number,
  availableWidth: number
): number {
  if (measuredWidth <= availableWidth || measuredWidth === 0) return preferredSize
  return preferredSize * (availableWidth / measuredWidth)
}

function color(value: string) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)?.[1] ?? "000000"
  return rgb(
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255
  )
}

function pdfY(yMm: number, heightMm: number, specification: PageSpecification): number {
  return pt(specification.mediaHeightMm - specification.bleedMm - yMm - heightMm)
}

async function embedImage(pdf: PDFDocument, assetId: string): Promise<PDFImage> {
  const asset = await getAsset(assetId)
  const source = await getObject(asset.objectKey)
  return asset.mimeType === "image/png" ? pdf.embedPng(source.body) : pdf.embedJpg(source.body)
}

/**
 * Rotates everything `draw` paints around the top-left corner of `geometry`, which is the corner
 * the preview turns an element around (`transform-origin: top left`). Page space counts Y upwards
 * where CSS counts it downwards, so the same visual turn is the negated angle here.
 *
 * A transformation matrix rather than pdf-lib's per-call `rotate` option: a clip path, the photo
 * inside it, and every slot of a gallery have to turn as one, while `rotate` would turn each
 * drawing around its own anchor and pull the frame apart.
 */
function withTopLeftRotation(
  page: PDFPage,
  geometry: LayoutElement["geometry"],
  specification: PageSpecification,
  draw: () => void
) {
  if (!geometry.rotation) {
    draw()
    return
  }
  const pivotX = pt(specification.bleedMm + geometry.x)
  const pivotY = pdfY(geometry.y, 0, specification)
  page.pushOperators(
    pushGraphicsState(),
    translate(pivotX, pivotY),
    rotateDegrees(-geometry.rotation),
    translate(-pivotX, -pivotY)
  )
  draw()
  page.pushOperators(popGraphicsState())
}

function drawCroppedImage(
  page: PDFPage,
  image: PDFImage,
  geometry: { x: number; y: number; width: number; height: number },
  specification: PageSpecification,
  focalPoint = { x: 0.5, y: 0.5 }
) {
  const x = pt(specification.bleedMm + geometry.x)
  const y = pdfY(geometry.y, geometry.height, specification)
  const width = pt(geometry.width)
  const height = pt(geometry.height)
  const scale = Math.max(width / image.width, height / image.height)
  const drawnWidth = image.width * scale
  const drawnHeight = image.height * scale
  const availableX = drawnWidth - width
  const availableY = drawnHeight - height
  const drawnX = x - availableX * focalPoint.x
  const drawnY = y - availableY * (1 - focalPoint.y)
  page.pushOperators(pushGraphicsState(), rectangle(x, y, width, height), clip(), endPath())
  page.drawImage(image, {
    x: drawnX,
    y: drawnY,
    width: drawnWidth,
    height: drawnHeight,
  })
  page.pushOperators(popGraphicsState())
}

/**
 * Draws the placeholder motif for a photo slot the contributor left unfilled. Nothing is painted
 * behind it, so the slot keeps whatever the page already puts there. The art is vector, so unlike
 * an embedded photo it carries no resolution and never reaches the preflight PPI rules.
 *
 * `drawSvgPath` translates to the given point and then flips the Y axis, so the anchor is the top
 * edge of the motif square in page space.
 */
function drawFillerArt(input: {
  page: PDFPage
  geometry: { x: number; y: number; width: number; height: number }
  specification: PageSpecification
  palette: FillerPalette
  seed: string
  slotIndex: number
  opacity: number
}) {
  const x = pt(input.specification.bleedMm + input.geometry.x)
  const y = pdfY(input.geometry.y, input.geometry.height, input.specification)
  const width = pt(input.geometry.width)
  const height = pt(input.geometry.height)
  const placement = motifPlacement(width, height)
  const left = x + placement.offsetX
  const top = y + height - placement.offsetY
  for (const shape of fillerMotif(input.seed, input.slotIndex).shapes) {
    const tone = color(input.palette[shape.tone])
    input.page.drawSvgPath(shape.d, {
      x: left,
      y: top,
      scale: placement.scale,
      ...(shape.strokeWidth
        ? {
            borderColor: tone,
            borderWidth: shape.strokeWidth,
            borderLineCap: LineCapStyle.Round,
            borderOpacity: input.opacity,
          }
        : { color: tone, opacity: input.opacity }),
    })
  }
}

function drawTextElement(input: {
  locale?: Locale
  page: PDFPage
  fonts: EmbeddedFonts
  runs: TextLayoutRun[]
  settings: TextSettings
  geometry: LayoutElement["geometry"]
  opacity: number
  specification: PageSpecification
}) {
  if (!input.runs.some((run) => run.text.trim())) return
  const layout = layoutText(
    input.runs,
    input.geometry.width,
    input.geometry.height,
    input.settings,
    input.locale
  )
  const size = layout.effectiveFontSize
  const width = pt(input.geometry.width)
  const lineHeight = pt(layout.lineHeightMm)
  // The vertical alignment offset walks down the box's own axis, which is what the rotated HTML
  // preview does with its padding. Adding it straight to the page-space Y instead would slide
  // rotated text sideways out of its own box.
  const alignment = alignmentOffsetMm(layout.offsetYMm, input.geometry.rotation)
  const top = pdfY(input.geometry.y + alignment.yMm, 0, input.specification)
  layout.renderedLines.forEach((line, index) => {
    const textWidth = pt(line.widthMm)
    const offset =
      input.settings.alignment === "center"
        ? (width - textWidth) / 2
        : input.settings.alignment === "right"
          ? width - textWidth
          : 0
    input.page.drawText(line.text, {
      x: pt(input.specification.bleedMm + input.geometry.x + alignment.xMm) + offset,
      y: top - lineHeight * (index + 1),
      size,
      font: embeddedFont(
        input.fonts,
        fontCut(input.settings.fontFamily, input.settings.fontStyle, line.fontWeight)
      ),
      color: color(input.settings.color),
      opacity: input.opacity,
      rotate: degrees(-input.geometry.rotation),
    })
  })
}

async function drawElement(input: {
  locale?: Locale
  pdf: PDFDocument
  page: PDFPage
  pageId: string
  element: LayoutElement
  /** Absent on cover and standalone pages, which have no response behind them. */
  submission?: SubmissionSummary
  photoAssignment: PhotoAssignment
  form: FormSchema
  fonts: EmbeddedFonts
  fillerPalette: FillerPalette
  assetResolutions: AssetResolutionMetadata[]
  specification: PageSpecification
}) {
  const { element, page } = input
  const geometry = element.geometry
  const x = pt(input.specification.bleedMm + geometry.x)
  const y = pdfY(geometry.y, geometry.height, input.specification)
  const width = pt(geometry.width)
  const height = pt(geometry.height)

  if (element.type === "bound-text" || element.type === "static-text") {
    const question =
      element.type === "bound-text"
        ? input.form.questions.find((candidate) => candidate.id === element.questionId)
        : undefined
    drawTextElement({
      locale: input.locale,
      page,
      fonts: input.fonts,
      runs: textRunsForElement(
        element,
        question,
        element.type === "bound-text" ? input.submission?.answers[element.questionId] : undefined,
        "",
        input.locale
      ),
      settings: element.text,
      geometry,
      opacity: element.opacity,
      specification: input.specification,
    })
    return
  }
  if (element.type === "rectangle" || element.type === "circle") {
    const options = {
      x,
      y,
      width,
      height,
      color: color(element.fill),
      borderColor: color(element.stroke),
      borderWidth: pt(element.strokeWidth),
      opacity: element.opacity,
      rotate: degrees(-geometry.rotation),
    }
    if (element.type === "rectangle") page.drawRectangle(options)
    else
      page.drawEllipse({
        x: x + width / 2,
        y: y + height / 2,
        xScale: width / 2,
        yScale: height / 2,
        color: options.color,
        borderColor: options.borderColor,
        borderWidth: options.borderWidth,
        opacity: options.opacity,
      })
    return
  }
  if (element.type === "line") {
    page.drawLine({
      start: { x, y: y + height },
      end: { x: x + width, y },
      color: color(element.stroke),
      thickness: pt(element.strokeWidth),
      opacity: element.opacity,
    })
    return
  }
  if (element.type === "decorative-image") {
    if (!element.assetId) return
    const image = await embedImage(input.pdf, element.assetId)
    input.assetResolutions.push({
      assetId: element.assetId,
      pageId: input.pageId,
      elementId: element.id,
      pixelWidth: image.width,
      pixelHeight: image.height,
      placedWidthMm: geometry.width,
      placedHeightMm: geometry.height,
      effectivePpi: effectivePpi(image.width, image.height, geometry.width, geometry.height),
    })
    withTopLeftRotation(page, geometry, input.specification, () =>
      drawCroppedImage(page, image, geometry, input.specification, element.focalPoint)
    )
    return
  }
  if (element.type !== "image-frame" && element.type !== "gallery-frame") {
    return
  }

  const images = framePhotos(input.photoAssignment, element.id)
  // Filler art only appears where a photo frame stays empty, which a standalone page cannot have;
  // the page id keeps the seed stable if one ever does.
  const seed = fillerSeed(input.submission?.id ?? input.pageId, element.id)
  if (element.type === "image-frame") {
    const image = images[0]
    if (!image) {
      withTopLeftRotation(page, geometry, input.specification, () =>
        drawFillerArt({
          page,
          geometry,
          specification: input.specification,
          palette: input.fillerPalette,
          seed,
          slotIndex: 0,
          opacity: element.opacity,
        })
      )
      return
    }
    const embeddedImage = await embedImage(input.pdf, image.assetId)
    input.assetResolutions.push({
      assetId: image.assetId,
      pageId: input.pageId,
      elementId: element.id,
      pixelWidth: embeddedImage.width,
      pixelHeight: embeddedImage.height,
      placedWidthMm: geometry.width,
      placedHeightMm: geometry.height,
      effectivePpi: effectivePpi(
        embeddedImage.width,
        embeddedImage.height,
        geometry.width,
        geometry.height
      ),
    })
    withTopLeftRotation(page, geometry, input.specification, () =>
      drawCroppedImage(
        page,
        embeddedImage,
        geometry,
        input.specification,
        effectiveFocalPoint(element, image)
      )
    )
    return
  }
  const slots = gallerySlots(element.arrangement, geometry.width, geometry.height, element.gap)
  // Every photo is embedded before anything is painted, so the frame's rotation can wrap one
  // uninterrupted run of drawing operators and turn the whole gallery as a unit.
  const slotPhotos = await Promise.all(
    slots.map(async (_slot, index) => {
      const image = images[index]
      return image ? { image, embedded: await embedImage(input.pdf, image.assetId) } : undefined
    })
  )
  withTopLeftRotation(page, geometry, input.specification, () => {
    slots.forEach((slot, index) => {
      const photo = slotPhotos[index]
      const slotGeometry = {
        x: geometry.x + slot.x,
        y: geometry.y + slot.y,
        width: slot.width,
        height: slot.height,
      }
      if (!photo) {
        drawFillerArt({
          page,
          geometry: slotGeometry,
          specification: input.specification,
          palette: input.fillerPalette,
          seed,
          slotIndex: index,
          opacity: element.opacity,
        })
        return
      }
      input.assetResolutions.push({
        assetId: photo.image.assetId,
        pageId: input.pageId,
        elementId: element.id,
        pixelWidth: photo.embedded.width,
        pixelHeight: photo.embedded.height,
        placedWidthMm: slot.width,
        placedHeightMm: slot.height,
        effectivePpi: effectivePpi(
          photo.embedded.width,
          photo.embedded.height,
          slot.width,
          slot.height
        ),
      })
      drawCroppedImage(
        page,
        photo.embedded,
        slotGeometry,
        input.specification,
        effectiveFocalPoint(element, photo.image)
      )
    })
  })
}

function applyPageBoxes(page: PDFPage, specification: PageSpecification) {
  const context = page.doc.context
  const trim = context.obj([
    PDFNumber.of(pt(specification.bleedMm)),
    PDFNumber.of(pt(specification.bleedMm)),
    PDFNumber.of(pt(specification.bleedMm + specification.trimWidthMm)),
    PDFNumber.of(pt(specification.bleedMm + specification.trimHeightMm)),
  ])
  const bleed = context.obj([
    PDFNumber.of(0),
    PDFNumber.of(0),
    PDFNumber.of(pt(specification.mediaWidthMm)),
    PDFNumber.of(pt(specification.mediaHeightMm)),
  ])
  page.node.set(PDFName.of("TrimBox"), trim)
  page.node.set(PDFName.of("BleedBox"), bleed)
}

function drawMarks(page: PDFPage, specification: PageSpecification) {
  const trimLeft = pt(specification.bleedMm)
  const trimRight = pt(specification.bleedMm + specification.trimWidthMm)
  const trimBottom = pt(specification.bleedMm)
  const trimTop = pt(specification.bleedMm + specification.trimHeightMm)
  const length = pt(2)
  const gap = pt(0.5)
  const options = { color: rgb(0, 0, 0), thickness: 0.25, opacity: 1 }
  for (const x of [trimLeft, trimRight]) {
    page.drawLine({
      start: { x, y: trimBottom - gap },
      end: { x, y: trimBottom - gap - length },
      ...options,
    })
    page.drawLine({
      start: { x, y: trimTop + gap },
      end: { x, y: trimTop + gap + length },
      ...options,
    })
  }
  for (const y of [trimBottom, trimTop]) {
    page.drawLine({
      start: { x: trimLeft - gap, y },
      end: { x: trimLeft - gap - length, y },
      ...options,
    })
    page.drawLine({
      start: { x: trimRight + gap, y },
      end: { x: trimRight + gap + length, y },
      ...options,
    })
  }
}

function setPdfXMetadata(
  pdf: PDFDocument,
  deflatedIcc: Uint8Array,
  assetResolutions: AssetResolutionMetadata[]
) {
  const context = pdf.context
  const iccStream = context.stream(deflatedIcc, {
    N: PDFNumber.of(4),
    Alternate: PDFName.of("DeviceCMYK"),
    Filter: "FlateDecode",
  })
  const iccReference = context.register(iccStream)
  const outputIntent = context.obj({
    Type: PDFName.of("OutputIntent"),
    S: PDFName.of("GTS_PDFX"),
    OutputConditionIdentifier: PDFString.of("FOGRA51"),
    OutputCondition: PDFString.of("PSO Coated v3"),
    RegistryName: PDFString.of("https://registry.color.org"),
    Info: PDFString.of("PSO Coated v3 (FOGRA51)"),
    DestOutputProfile: iccReference,
  })
  const outputIntentReference = context.register(outputIntent)
  const outputIntents = PDFArray.withContext(context)
  outputIntents.push(outputIntentReference)
  pdf.catalog.set(PDFName.of("OutputIntents"), outputIntents)
  const resolutionMetadata = PDFArray.withContext(context)
  for (const entry of assetResolutions) {
    resolutionMetadata.push(
      context.register(
        context.obj({
          Type: PDFName.of("SakekeepAssetResolution"),
          AssetID: PDFString.of(entry.assetId),
          PageID: PDFString.of(entry.pageId),
          ElementID: PDFString.of(entry.elementId),
          PixelWidth: PDFNumber.of(entry.pixelWidth),
          PixelHeight: PDFNumber.of(entry.pixelHeight),
          PlacedWidthMM: PDFNumber.of(entry.placedWidthMm),
          PlacedHeightMM: PDFNumber.of(entry.placedHeightMm),
          EffectivePPI: PDFNumber.of(entry.effectivePpi),
        })
      )
    )
  }
  pdf.catalog.set(PDFName.of("SakekeepAssetResolutions"), resolutionMetadata)

  const xmp = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <pdfxid:GTS_PDFXVersion>PDF/X-4</pdfxid:GTS_PDFXVersion>
      <dc:format>application/pdf</dc:format>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
  const metadata = context.flateStream(Buffer.from(xmp, "utf8"), {
    Type: PDFName.of("Metadata"),
    Subtype: PDFName.of("XML"),
  })
  pdf.catalog.set(PDFName.of("Metadata"), context.register(metadata))
  const info = context.lookup(context.trailerInfo.Info)
  if (info instanceof PDFDict) {
    info.set(PDFName.of("GTS_PDFXVersion"), PDFString.of("PDF/X-4"))
    info.set(PDFName.of("GTS_PDFXConformance"), PDFString.of("Structurally verified"))
  }
}

/** Every static cut the book needs, including the bold cut used for labels. */
function requiredCuts(pages: BookPage[], layouts: Map<string, LayoutRecord>): Set<FontCut> {
  const cuts = new Set<FontCut>()
  for (const bookPage of pages) {
    for (const element of layouts.get(bookPage.layoutId)?.schema.elements ?? []) {
      if (element.type !== "bound-text" && element.type !== "static-text") continue
      cuts.add(fontCut(element.text.fontFamily, element.text.fontStyle, "normal"))
      cuts.add(fontCut(element.text.fontFamily, element.text.fontStyle, "bold"))
    }
  }
  return cuts
}

// Keep complete fonts embedded: fontkit's subset encoder can drop glyphs from
// mixed layout pages.
async function embedFonts(pdf: PDFDocument, cuts: Set<FontCut>): Promise<EmbeddedFonts> {
  const embedded = await Promise.all(
    [...cuts].map(async (cut) => {
      const bytes = await readFile(resolve(FONT_CUT_FILES[cut]))
      return [cut, await pdf.embedFont(bytes, { subset: false })] as const
    })
  )
  return Object.fromEntries(embedded)
}

export interface BookRenderInput {
  locale?: Locale
  book: GeneratedBook
  layouts: LayoutRecord[]
  submissions: SubmissionSummary[]
  form: FormSchema
  marks: boolean
  pageFormat?: PageFormat
  pageOrientation?: PageOrientation
}

/**
 * The output intent profile, deflated once. Splitting a book gives every page its own
 * output intent, and re-compressing two megabytes of profile per page would dominate the
 * export.
 */
async function iccProfile(): Promise<Uint8Array> {
  try {
    return deflateSync(await readFile(resolve(".local/icc/PSOcoated_v3.icc")))
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(
      503,
      m.ui_the_verified_pso_coated_v3_profile_is_missing_run_bun_run_setup_i()
    )
  }
}

async function renderPdf(input: BookRenderInput, pages: BookPage[]): Promise<Uint8Array> {
  const icc = await iccProfile()
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  pdf.setTitle(m.pdf_title({}, { locale: input.locale ?? "en" }))
  pdf.setCreator("Sakekeep")
  pdf.setProducer("Sakekeep / pdf-lib")
  const layouts = new Map(input.layouts.map((layout) => [layout.id, layout]))
  const submissions = new Map(input.submissions.map((submission) => [submission.id, submission]))
  const fonts = await embedFonts(pdf, requiredCuts(pages, layouts))
  const assetResolutions: AssetResolutionMetadata[] = []
  const specification = pageSpecification(
    input.pageFormat ?? "a5",
    input.pageOrientation ?? "landscape"
  )

  for (const bookPage of pages) {
    const page = pdf.addPage([pt(specification.mediaWidthMm), pt(specification.mediaHeightMm)])
    applyPageBoxes(page, specification)
    const layout = layouts.get(bookPage.layoutId)
    const submission =
      bookPage.kind === "submission" ? submissions.get(bookPage.submissionId) : undefined
    if (!layout || (bookPage.kind === "submission" && !submission)) {
      throw new HttpError(409, "A generated page references a missing layout or submission.")
    }
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pt(specification.mediaWidthMm),
      height: pt(specification.mediaHeightMm),
      color: color(layout.schema.background),
    })
    const photoAssignment = assignPhotosToFrames(layout.schema.elements, submission?.answers ?? {})
    const palette = fillerPalette(layout.schema)
    for (const element of layout.schema.elements) {
      await drawElement({
        locale: input.locale,
        pdf,
        page,
        pageId: bookPage.id,
        element,
        submission,
        photoAssignment,
        form: input.form,
        fonts,
        fillerPalette: palette,
        assetResolutions,
        specification,
      })
    }
    if (input.marks) drawMarks(page, specification)
  }
  setPdfXMetadata(pdf, icc, assetResolutions)
  return pdf.save({ useObjectStreams: false, addDefaultPage: false })
}

export async function renderBookPdf(input: BookRenderInput): Promise<Uint8Array> {
  return renderPdf(input, input.book.pages)
}

/** One single-page PDF per book page, in book order. */
function assetResolutionsOf(document: PDFDocument): AssetResolutionMetadata[] {
  const entries = document.catalog.lookup(PDFName.of("SakekeepAssetResolutions"))
  if (!(entries instanceof PDFArray)) return []
  const numberAt = (entry: PDFDict, key: string) => {
    const value = entry.lookup(PDFName.of(key))
    return value instanceof PDFNumber ? value.asNumber() : 0
  }
  const stringAt = (entry: PDFDict, key: string) => {
    const value = entry.lookup(PDFName.of(key))
    return value instanceof PDFString ? value.asString() : ""
  }
  return Array.from({ length: entries.size() }, (_, index) => entries.lookup(index)).flatMap(
    (entry) =>
      entry instanceof PDFDict
        ? [
            {
              assetId: stringAt(entry, "AssetID"),
              pageId: stringAt(entry, "PageID"),
              elementId: stringAt(entry, "ElementID"),
              pixelWidth: numberAt(entry, "PixelWidth"),
              pixelHeight: numberAt(entry, "PixelHeight"),
              placedWidthMm: numberAt(entry, "PlacedWidthMM"),
              placedHeightMm: numberAt(entry, "PlacedHeightMM"),
              effectivePpi: numberAt(entry, "EffectivePPI"),
            },
          ]
        : []
  )
}

/**
 * Splits an exported book into one single-page PDF per page, in book order. The pages are
 * copied rather than rendered again, so each file is the very page the preflighted book
 * carries; only the catalog-level output intent and PDF/X metadata have to be re-applied,
 * because those do not travel with a copied page.
 */
/**
 * Yields one print-ready single-page PDF per book page, in book order. Pages are produced
 * on demand: each one embeds the fonts and the output intent its page needs, so keeping a
 * whole book of them would grow the heap with the page count.
 */
export async function* bookPagePdfs(
  bookPdf: Uint8Array,
  pageIds: string[]
): AsyncGenerator<Uint8Array> {
  const icc = await iccProfile()
  const source = await PDFDocument.load(bookPdf)
  const assetResolutions = assetResolutionsOf(source)
  for (let index = 0; index < source.getPageCount(); index += 1) {
    const single = await PDFDocument.create()
    single.setTitle(source.getTitle() ?? m.pdf_title({}, { locale: "en" }))
    single.setCreator("Sakekeep")
    single.setProducer("Sakekeep / pdf-lib")
    const [page] = await single.copyPages(source, [index])
    single.addPage(page)
    const pageId = pageIds[index]
    setPdfXMetadata(
      single,
      icc,
      assetResolutions.filter((entry) => entry.pageId === pageId)
    )
    yield await single.save({ useObjectStreams: false, addDefaultPage: false })
  }
}

export async function inspectPdf(
  bytes: Uint8Array,
  specification: PageSpecification = PAGE_SPEC
): Promise<{
  pageCount: number
  pageBoxesValid: boolean
  fontsEmbedded: boolean
  outputIntentEmbedded: boolean
  pdfxMetadata: boolean
  assetResolutionMetadata: boolean
  assetResolutionCount: number
  assetPlacements: Array<{ assetId: string; elementId: string }>
}> {
  const document = await PDFDocument.load(bytes)
  const tolerance = 0.2
  const expectedWidth = pt(specification.mediaWidthMm)
  const expectedHeight = pt(specification.mediaHeightMm)
  const boxMatches = (box: unknown, expected: number[]) =>
    box instanceof PDFArray &&
    box.size() === expected.length &&
    expected.every((value, index) => {
      const item = box.lookup(index)
      return item instanceof PDFNumber && Math.abs(item.asNumber() - value) < tolerance
    })
  const pageBoxesValid = document.getPages().every((page) => {
    const size = page.getSize()
    const trimBox = page.node.lookup(PDFName.of("TrimBox"))
    const bleedBox = page.node.lookup(PDFName.of("BleedBox"))
    return (
      Math.abs(size.width - expectedWidth) < tolerance &&
      Math.abs(size.height - expectedHeight) < tolerance &&
      boxMatches(trimBox, [
        pt(specification.bleedMm),
        pt(specification.bleedMm),
        pt(specification.bleedMm + specification.trimWidthMm),
        pt(specification.bleedMm + specification.trimHeightMm),
      ]) &&
      boxMatches(bleedBox, [0, 0, expectedWidth, expectedHeight])
    )
  })
  const raw = Buffer.from(bytes).toString("latin1")
  const assetResolutions = document.catalog.lookup(PDFName.of("SakekeepAssetResolutions"))
  const assetResolutionEntries =
    assetResolutions instanceof PDFArray
      ? Array.from({ length: assetResolutions.size() }, (_, index) =>
          assetResolutions.lookup(index)
        )
      : []
  const assetResolutionMetadata =
    assetResolutions instanceof PDFArray &&
    assetResolutionEntries.every(
      (entry) =>
        entry instanceof PDFDict &&
        entry.has(PDFName.of("AssetID")) &&
        entry.has(PDFName.of("PageID")) &&
        entry.has(PDFName.of("ElementID")) &&
        entry.has(PDFName.of("PixelWidth")) &&
        entry.has(PDFName.of("PixelHeight")) &&
        entry.has(PDFName.of("PlacedWidthMM")) &&
        entry.has(PDFName.of("PlacedHeightMM")) &&
        entry.has(PDFName.of("EffectivePPI"))
    )
  return {
    pageCount: document.getPageCount(),
    pageBoxesValid,
    fontsEmbedded: /\/FontFile[23]?\b/.test(raw),
    outputIntentEmbedded:
      /\/OutputIntents\b/.test(raw) && /\/GTS_PDFX\b/.test(raw) && /FOGRA51/.test(raw),
    pdfxMetadata: /GTS_PDFXVersion/.test(raw) && /PDF\/X-4/.test(raw),
    assetResolutionMetadata,
    assetResolutionCount: assetResolutionEntries.length,
    // Which photo the export actually placed in which frame, so distribution is verifiable
    // from the produced PDF rather than only from the renderer's inputs.
    assetPlacements: assetResolutionEntries.flatMap((entry) => {
      if (!(entry instanceof PDFDict)) return []
      const assetId = entry.lookup(PDFName.of("AssetID"))
      const elementId = entry.lookup(PDFName.of("ElementID"))
      if (!(assetId instanceof PDFString) || !(elementId instanceof PDFString)) return []
      return [{ assetId: assetId.asString(), elementId: elementId.asString() }]
    }),
  }
}
