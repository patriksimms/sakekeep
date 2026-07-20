import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import fontkit from "@pdf-lib/fontkit"
import {
  clip,
  degrees,
  endPath,
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
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib"

import { effectivePpi, fitText } from "../domain/generation"
import { gallerySlots, PAGE_SPEC } from "../domain/layout"
import {
  type BookPage,
  type FormSchema,
  type GeneratedBook,
  type ImageAnswer,
  type LayoutElement,
  type LayoutRecord,
  type SubmissionAnswer,
  type SubmissionSummary,
  type TextSettings,
} from "../domain/types"
import { HttpError } from "./http"
import { getObject } from "./object-store"
import { getAsset } from "./repository"

const POINTS_PER_MM = 72 / 25.4
type EmbeddedFonts = Record<
  | "Inter-normal-normal"
  | "Inter-normal-bold"
  | "Inter-italic-normal"
  | "Inter-italic-bold"
  | "Source Serif 4-normal-normal"
  | "Source Serif 4-normal-bold"
  | "Source Serif 4-italic-normal"
  | "Source Serif 4-italic-bold",
  PDFFont
>

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

function fontKey(settings: TextSettings): keyof EmbeddedFonts {
  return `${settings.fontFamily}-${settings.fontStyle}-${settings.fontWeight}`
}

function pt(mm: number): number {
  return mm * POINTS_PER_MM
}

function color(value: string) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)?.[1] ?? "000000"
  return rgb(
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255
  )
}

function pdfY(yMm: number, heightMm: number): number {
  return pt(PAGE_SPEC.mediaHeightMm - PAGE_SPEC.bleedMm - yMm - heightMm)
}

async function embedImage(pdf: PDFDocument, assetId: string): Promise<PDFImage> {
  const asset = await getAsset(assetId)
  const source = await getObject(asset.objectKey)
  return asset.mimeType === "image/png" ? pdf.embedPng(source.body) : pdf.embedJpg(source.body)
}

function answerImages(answer: SubmissionAnswer | undefined): ImageAnswer[] {
  if (!Array.isArray(answer)) return []
  return answer.filter(
    (item): item is ImageAnswer => typeof item === "object" && item !== null && "assetId" in item
  )
}

function drawCroppedImage(
  page: PDFPage,
  image: PDFImage,
  geometry: { x: number; y: number; width: number; height: number },
  focalPoint = { x: 0.5, y: 0.5 }
) {
  const x = pt(PAGE_SPEC.bleedMm + geometry.x)
  const y = pdfY(geometry.y, geometry.height)
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

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = []
  for (const explicitLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const words = explicitLine.split(/\s+/)
    let line = ""
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= width || !line) {
        line = candidate
      } else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  return lines
}

function textContent(
  element: Extract<LayoutElement, { type: "bound-text" | "static-text" }>,
  submission: SubmissionSummary,
  form: FormSchema
): string {
  if (element.type === "static-text") return element.content
  const answer = submission.answers[element.questionId]
  if (typeof answer !== "string") return ""
  if (!element.showLabel) return answer
  const question = form.questions.find((candidate) => candidate.id === element.questionId)
  const label = element.label?.trim() || question?.prompt || ""
  return label ? `${label}\n${answer}` : answer
}

function drawTextElement(input: {
  page: PDFPage
  font: PDFFont
  content: string
  settings: TextSettings
  geometry: LayoutElement["geometry"]
  opacity: number
}) {
  if (!input.content.trim()) return
  const fit = fitText(
    input.content,
    input.geometry.width,
    input.geometry.height,
    input.settings.fontSize,
    input.settings.minFontSize,
    input.settings.lineHeight,
    input.settings.overflow
  )
  const size = fit.effectiveFontSize
  const width = pt(input.geometry.width)
  const height = pt(input.geometry.height)
  const lineHeight = pt(size * 0.3528 * input.settings.lineHeight)
  let lines = wrapText(input.content, input.font, size, width)
  const maxLines = Math.max(1, Math.floor(height / lineHeight))
  if (input.settings.overflow === "truncate" && lines.length > maxLines) {
    lines = lines.slice(0, maxLines)
    let last = `${lines.at(-1) ?? ""}…`
    while (last.length > 1 && input.font.widthOfTextAtSize(last, size) > width) {
      last = `${last.slice(0, -2)}…`
    }
    lines[lines.length - 1] = last
  }
  const top = pdfY(input.geometry.y, 0)
  lines.slice(0, maxLines).forEach((line, index) => {
    const textWidth = input.font.widthOfTextAtSize(line, size)
    const offset =
      input.settings.alignment === "center"
        ? (width - textWidth) / 2
        : input.settings.alignment === "right"
          ? width - textWidth
          : 0
    input.page.drawText(line, {
      x: pt(PAGE_SPEC.bleedMm + input.geometry.x) + offset,
      y: top - lineHeight * (index + 1),
      size,
      font: input.font,
      color: color(input.settings.color),
      opacity: input.opacity,
      rotate: degrees(-input.geometry.rotation),
    })
  })
}

async function drawElement(input: {
  pdf: PDFDocument
  page: PDFPage
  pageId: string
  element: LayoutElement
  submission: SubmissionSummary
  form: FormSchema
  fonts: EmbeddedFonts
  assetResolutions: AssetResolutionMetadata[]
}) {
  const { element, page } = input
  const geometry = element.geometry
  const x = pt(PAGE_SPEC.bleedMm + geometry.x)
  const y = pdfY(geometry.y, geometry.height)
  const width = pt(geometry.width)
  const height = pt(geometry.height)

  if (element.type === "bound-text" || element.type === "static-text") {
    drawTextElement({
      page,
      font: input.fonts[fontKey(element.text)],
      content: textContent(element, input.submission, input.form),
      settings: element.text,
      geometry,
      opacity: element.opacity,
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
    drawCroppedImage(page, image, geometry, element.focalPoint)
    return
  }
  if (element.type !== "image-frame" && element.type !== "gallery-frame") {
    return
  }

  const images = answerImages(input.submission.answers[element.questionId])
  if (images.length === 0) return
  if (element.type === "image-frame") {
    const image = images[0]!
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
    drawCroppedImage(page, embeddedImage, geometry, element.focalPoint ?? image.focalPoint)
    return
  }
  const slots = gallerySlots(element.arrangement, geometry.width, geometry.height, element.gap)
  await Promise.all(
    images.slice(0, slots.length).map(async (image, index) => {
      const slot = slots[index]!
      const embeddedImage = await embedImage(input.pdf, image.assetId)
      input.assetResolutions.push({
        assetId: image.assetId,
        pageId: input.pageId,
        elementId: element.id,
        pixelWidth: embeddedImage.width,
        pixelHeight: embeddedImage.height,
        placedWidthMm: slot.width,
        placedHeightMm: slot.height,
        effectivePpi: effectivePpi(
          embeddedImage.width,
          embeddedImage.height,
          slot.width,
          slot.height
        ),
      })
      drawCroppedImage(
        page,
        embeddedImage,
        {
          x: geometry.x + slot.x,
          y: geometry.y + slot.y,
          width: slot.width,
          height: slot.height,
        },
        element.focalPoint ?? image.focalPoint
      )
    })
  )
}

function applyPageBoxes(page: PDFPage) {
  const context = page.doc.context
  const trim = context.obj([
    PDFNumber.of(pt(3)),
    PDFNumber.of(pt(3)),
    PDFNumber.of(pt(213)),
    PDFNumber.of(pt(151)),
  ])
  const bleed = context.obj([
    PDFNumber.of(0),
    PDFNumber.of(0),
    PDFNumber.of(pt(216)),
    PDFNumber.of(pt(154)),
  ])
  page.node.set(PDFName.of("TrimBox"), trim)
  page.node.set(PDFName.of("BleedBox"), bleed)
}

function drawMarks(page: PDFPage) {
  const trimLeft = pt(3)
  const trimRight = pt(213)
  const trimBottom = pt(3)
  const trimTop = pt(151)
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
  icc: Uint8Array,
  assetResolutions: AssetResolutionMetadata[]
) {
  const context = pdf.context
  const iccStream = context.flateStream(icc, {
    N: PDFNumber.of(4),
    Alternate: PDFName.of("DeviceCMYK"),
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

function standaloneText(page: BookPage): { title: string; body: string } {
  if (page.kind !== "standalone") return { title: "", body: "" }
  return { title: page.title, body: page.body }
}

export async function renderBookPdf(input: {
  book: GeneratedBook
  layouts: LayoutRecord[]
  submissions: SubmissionSummary[]
  form: FormSchema
  marks: boolean
}): Promise<Uint8Array> {
  let icc: Uint8Array
  try {
    icc = await readFile(resolve(".local/icc/PSOcoated_v3.icc"))
  } catch {
    throw new HttpError(
      503,
      "The verified PSO Coated v3 profile is missing. Run `bun run setup:icc` and try again."
    )
  }
  const fontBytes = await Promise.all([
    readFile(resolve("assets/fonts/Inter-Regular.ttf")),
    readFile(resolve("assets/fonts/Inter-Bold.ttf")),
    readFile(resolve("assets/fonts/Inter-Italic.ttf")),
    readFile(resolve("assets/fonts/Inter-BoldItalic.ttf")),
    readFile(resolve("assets/fonts/SourceSerif4-Regular-Print.ttf")),
    readFile(resolve("assets/fonts/SourceSerif4-Bold-Print.ttf")),
    readFile(resolve("assets/fonts/SourceSerif4-Italic-Print.ttf")),
    readFile(resolve("assets/fonts/SourceSerif4-BoldItalic-Print.ttf")),
  ])
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  pdf.setTitle("Sakekeep friend book")
  pdf.setCreator("Sakekeep local prototype")
  pdf.setProducer("Sakekeep / pdf-lib")
  // Static instances are generated from the OFL variable sources. Source Serif
  // print instances omit optional positioning tables that fontkit encodes with
  // malformed spacing. Keep complete fonts embedded: fontkit's subset encoder
  // can drop glyphs from mixed layout pages.
  const embedded = await Promise.all(
    fontBytes.map((bytes) => pdf.embedFont(bytes, { subset: false }))
  )
  const fonts: EmbeddedFonts = {
    "Inter-normal-normal": embedded[0]!,
    "Inter-normal-bold": embedded[1]!,
    "Inter-italic-normal": embedded[2]!,
    "Inter-italic-bold": embedded[3]!,
    "Source Serif 4-normal-normal": embedded[4]!,
    "Source Serif 4-normal-bold": embedded[5]!,
    "Source Serif 4-italic-normal": embedded[6]!,
    "Source Serif 4-italic-bold": embedded[7]!,
  }
  const layouts = new Map(input.layouts.map((layout) => [layout.id, layout]))
  const submissions = new Map(input.submissions.map((submission) => [submission.id, submission]))
  const assetResolutions: AssetResolutionMetadata[] = []

  for (const bookPage of input.book.pages) {
    const page = pdf.addPage([pt(PAGE_SPEC.mediaWidthMm), pt(PAGE_SPEC.mediaHeightMm)])
    applyPageBoxes(page)
    if (bookPage.kind === "standalone") {
      page.drawRectangle({
        x: 0,
        y: 0,
        width: pt(PAGE_SPEC.mediaWidthMm),
        height: pt(PAGE_SPEC.mediaHeightMm),
        color: color(bookPage.background),
      })
      const content = standaloneText(bookPage)
      if (bookPage.pageType !== "blank") {
        page.drawText(content.title, {
          x: pt(18),
          y: pt(100),
          size: 30,
          font: fonts["Source Serif 4-normal-bold"],
          color: color("#292524"),
        })
        const lines = wrapText(content.body, fonts["Inter-normal-normal"], 12, pt(170))
        lines.slice(0, 12).forEach((line, index) => {
          page.drawText(line, {
            x: pt(18),
            y: pt(86) - index * 16,
            size: 12,
            font: fonts["Inter-normal-normal"],
            color: color("#57534e"),
          })
        })
      }
    } else {
      const layout = layouts.get(bookPage.layoutId)
      const submission = submissions.get(bookPage.submissionId)
      if (!layout || !submission) {
        throw new HttpError(409, "A generated page references a missing layout or submission.")
      }
      page.drawRectangle({
        x: 0,
        y: 0,
        width: pt(PAGE_SPEC.mediaWidthMm),
        height: pt(PAGE_SPEC.mediaHeightMm),
        color: color(layout.schema.background),
      })
      for (const element of layout.schema.elements) {
        await drawElement({
          pdf,
          page,
          pageId: bookPage.id,
          element,
          submission,
          form: input.form,
          fonts,
          assetResolutions,
        })
      }
    }
    if (input.marks) drawMarks(page)
  }
  setPdfXMetadata(pdf, icc, assetResolutions)
  return pdf.save({ useObjectStreams: false, addDefaultPage: false })
}

export async function inspectPdf(bytes: Uint8Array): Promise<{
  pageCount: number
  pageBoxesValid: boolean
  fontsEmbedded: boolean
  outputIntentEmbedded: boolean
  pdfxMetadata: boolean
  assetResolutionMetadata: boolean
  assetResolutionCount: number
}> {
  const document = await PDFDocument.load(bytes)
  const tolerance = 0.2
  const expectedWidth = pt(PAGE_SPEC.mediaWidthMm)
  const expectedHeight = pt(PAGE_SPEC.mediaHeightMm)
  const pageBoxesValid = document.getPages().every((page) => {
    const size = page.getSize()
    const trimBox = page.node.lookup(PDFName.of("TrimBox"))
    const bleedBox = page.node.lookup(PDFName.of("BleedBox"))
    return (
      Math.abs(size.width - expectedWidth) < tolerance &&
      Math.abs(size.height - expectedHeight) < tolerance &&
      trimBox instanceof PDFArray &&
      bleedBox instanceof PDFArray
    )
  })
  const raw = Buffer.from(bytes).toString("latin1")
  const assetResolutions = document.catalog.lookup(PDFName.of("SakekeepAssetResolutions"))
  const assetResolutionMetadata =
    assetResolutions instanceof PDFArray &&
    Array.from({ length: assetResolutions.size() }, (_, index) =>
      assetResolutions.lookup(index)
    ).every(
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
    assetResolutionCount: assetResolutions instanceof PDFArray ? assetResolutions.size() : 0,
  }
}
