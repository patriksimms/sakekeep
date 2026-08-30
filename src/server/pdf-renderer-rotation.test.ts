import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib"
import { describe, expect, it, vi } from "vitest"

import { MOTIF_VIEWBOX } from "../domain/filler-art.ts"
import { gallerySlots } from "../domain/layout.ts"
import { pageSpecification, type PageSpecification } from "../domain/page-format.ts"
import { type LayoutElement, type LayoutRecord, type SubmissionSummary } from "../domain/types.ts"
import { completeForm, cycleSettings, layoutFixture, submissionFixture } from "../test/fixtures.ts"

vi.mock("./repository.ts", () => ({
  getAsset: vi.fn(async () => ({
    mimeType: "image/png",
    objectKey: "test/master.png",
  })),
}))

vi.mock("./object-store.ts", () => ({
  getObject: vi.fn(async () => ({
    body: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XxFvWQAAAABJRU5ErkJggg==",
      "base64"
    ),
    contentType: "image/png",
  })),
}))

const POINTS_PER_MM = 72 / 25.4
const specification = pageSpecification()

interface Point {
  x: number
  y: number
}

/** A PDF transformation matrix, in the order the `cm` operator writes it. */
interface Matrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

/** `inner` first, then `outer`, which is what `cm` does to the current transformation matrix. */
function compose(outer: Matrix, inner: Matrix): Matrix {
  return {
    a: inner.a * outer.a + inner.b * outer.c,
    b: inner.a * outer.b + inner.b * outer.d,
    c: inner.c * outer.a + inner.d * outer.c,
    d: inner.c * outer.b + inner.d * outer.d,
    e: inner.e * outer.a + inner.f * outer.c + outer.e,
    f: inner.e * outer.b + inner.f * outer.d + outer.f,
  }
}

function apply(matrix: Matrix, point: Point): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  }
}

/** The four corners of a box in some local space, mapped into page space. */
function quad(matrix: Matrix, width: number, height: number, origin: Point = { x: 0, y: 0 }) {
  return [
    { x: origin.x, y: origin.y },
    { x: origin.x + width, y: origin.y },
    { x: origin.x + width, y: origin.y + height },
    { x: origin.x, y: origin.y + height },
  ].map((corner) => apply(matrix, corner))
}

interface DrawnContent {
  /** One quad per clipping rectangle, which is the shape a photo is cropped to. */
  clips: Point[][]
  /** One quad per placed image, the unit square of the raster mapped into page space. */
  images: Point[][]
  /**
   * The transformation in force while each SVG path was painted, in painting order. SVG counts Y
   * downwards, so `drawSvgPath` mirrors the axis; page-space painting such as the background
   * never does, which is how the two are told apart here.
   */
  pathTransforms: Matrix[]
}

/**
 * Replays the drawing operators of one page far enough to say where each photo, crop rectangle,
 * and vector path actually lands on the sheet. Asserting on page-space corners rather than on the
 * operators themselves keeps these tests about placement rather than about how pdf-lib spells it.
 */
async function drawnContent(bytes: Uint8Array, index: number): Promise<DrawnContent> {
  const document = await PDFDocument.load(bytes)
  const contents = document.context.lookup(document.getPage(index).node.get(PDFName.of("Contents")))
  const streams =
    contents instanceof PDFArray
      ? contents.asArray().map((reference) => document.context.lookup(reference))
      : [contents]
  const source = streams
    .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
    .map((stream) => Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1"))
    .join("\n")
    // Literal and hexadecimal strings carry arbitrary bytes, so they are removed before the
    // operators are split apart rather than being parsed as operands.
    .replace(/\((?:\\.|[^\\()])*\)/g, " ")
    .replace(/<[^>]*>/g, " ")

  const content: DrawnContent = { clips: [], images: [], pathTransforms: [] }
  const stack: Matrix[] = []
  let transform = IDENTITY
  let operands: number[] = []
  let rectangle: { x: number; y: number; width: number; height: number } | undefined
  let clipping = false

  for (const token of source.split(/\s+/).filter(Boolean)) {
    const numeric = Number(token)
    if (!Number.isNaN(numeric) && /^[-+.\d]/.test(token)) {
      operands.push(numeric)
      continue
    }
    switch (token) {
      case "q":
        stack.push(transform)
        break
      case "Q":
        transform = stack.pop() ?? IDENTITY
        break
      case "cm": {
        const [a, b, c, d, e, f] = operands.slice(-6)
        transform = compose(transform, { a: a!, b: b!, c: c!, d: d!, e: e!, f: f! })
        break
      }
      case "re": {
        const [x, y, width, height] = operands.slice(-4)
        rectangle = { x: x!, y: y!, width: width!, height: height! }
        break
      }
      case "W":
        clipping = true
        break
      case "n":
        if (clipping && rectangle) {
          content.clips.push(
            quad(transform, rectangle.width, rectangle.height, { x: rectangle.x, y: rectangle.y })
          )
        }
        clipping = false
        rectangle = undefined
        break
      case "Do":
        content.images.push(quad(transform, 1, 1))
        break
      case "m":
        if (transform.a * transform.d - transform.b * transform.c < 0) {
          content.pathTransforms.push(transform)
        }
        break
      default:
        break
    }
    operands = []
  }
  return content
}

/** A point of the canonical layout space, in the page coordinates the exporter writes. */
function pagePoint(xMm: number, yMm: number, page: PageSpecification = specification): Point {
  return {
    x: (page.bleedMm + xMm) * POINTS_PER_MM,
    y: (page.mediaHeightMm - page.bleedMm - yMm) * POINTS_PER_MM,
  }
}

/**
 * The preview turns an element clockwise around its own top-left corner. Page space counts Y
 * upwards, so the same turn is the negated angle here.
 */
function rotatedAbout(point: Point, pivot: Point, degrees: number): Point {
  const radians = (-degrees * Math.PI) / 180
  const dx = point.x - pivot.x
  const dy = point.y - pivot.y
  return {
    x: pivot.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: pivot.y + dx * Math.sin(radians) + dy * Math.cos(radians),
  }
}

/** Where a box of canonical millimetres prints once its frame's rotation is applied. */
function expectedQuad(
  box: { x: number; y: number; width: number; height: number },
  pivotMm: { x: number; y: number },
  rotation: number
): Point[] {
  const pivot = pagePoint(pivotMm.x, pivotMm.y)
  return [
    pagePoint(box.x, box.y),
    pagePoint(box.x + box.width, box.y),
    pagePoint(box.x + box.width, box.y + box.height),
    pagePoint(box.x, box.y + box.height),
  ].map((corner) => rotatedAbout(corner, pivot, rotation))
}

/** Corners in a fixed order, so a quad can be compared without depending on where it started. */
function ordered(corners: Point[]): Point[] {
  return [...corners].sort((left, right) => left.x - right.x || left.y - right.y)
}

function expectQuadsToMatch(actual: Point[] | undefined, expected: Point[], label: string) {
  expect(actual, `${label} is drawn`).toBeDefined()
  const drawn = ordered(actual!)
  ordered(expected).forEach((corner, index) => {
    expect(drawn[index]!.x, `${label} corner ${index} x`).toBeCloseTo(corner.x, 3)
    expect(drawn[index]!.y, `${label} corner ${index} y`).toBeCloseTo(corner.y, 3)
  })
}

function photoAnswers(...assetIds: string[]) {
  return assetIds.map((assetId) => ({
    assetId,
    name: `${assetId}.png`,
    mimeType: "image/png",
    width: 1,
    height: 1,
    sizeBytes: 100,
  }))
}

async function renderElements(
  elements: LayoutElement[],
  submission: SubmissionSummary
): Promise<Uint8Array> {
  const { renderBookPdf } = await import("./pdf-renderer.ts")
  const layout: LayoutRecord = layoutFixture()
  layout.schema.elements = elements
  return renderBookPdf({
    book: {
      projectId: layout.projectId,
      settings: cycleSettings,
      pages: [
        {
          id: `submission:${submission.id}`,
          kind: "submission" as const,
          submissionId: submission.id,
          layoutId: layout.id,
          problems: [],
        },
      ],
      sourceFingerprint: "rotation-test",
      generatedAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z",
    },
    layouts: [layout],
    submissions: [submission],
    form: completeForm,
    marks: false,
  })
}

const FRAME = { x: 30, y: 24, width: 80, height: 60 }
const ROTATION = -12

function imageFrame(rotation: number): LayoutElement {
  return {
    id: "photo-frame",
    type: "image-frame",
    opacity: 1,
    geometry: { ...FRAME, rotation },
    questionId: "photos",
    cornerRadius: 0,
  }
}

describe("rotated frames in the exported PDF", () => {
  it("crops a photo to the frame at the angle the preview shows", async () => {
    const submission = submissionFixture("10000000-0000-4000-8000-000000000001", 1)
    submission.answers.photos = photoAnswers("rotated-photo")

    const content = await drawnContent(await renderElements([imageFrame(ROTATION)], submission), 0)

    expectQuadsToMatch(content.clips[0], expectedQuad(FRAME, FRAME, ROTATION), "rotated frame crop")
    // The photo itself is scaled to cover the frame, so only its angle is checked here; the crop
    // above is what decides where it prints.
    const [first, second] = content.images[0]!
    expect((Math.atan2(second!.y - first!.y, second!.x - first!.x) * 180) / Math.PI).toBeCloseTo(
      -ROTATION,
      6
    )
  })

  it("leaves an unrotated frame exactly where it was", async () => {
    const submission = submissionFixture("10000000-0000-4000-8000-000000000001", 1)
    submission.answers.photos = photoAnswers("straight-photo")

    const content = await drawnContent(await renderElements([imageFrame(0)], submission), 0)

    expectQuadsToMatch(content.clips[0], expectedQuad(FRAME, FRAME, 0), "axis-aligned frame crop")
  })

  it("turns filler art with the frame, so a slot does not move when a photo arrives", async () => {
    const submission = submissionFixture("10000000-0000-4000-8000-000000000002", 1)
    submission.answers.photos = []

    const content = await drawnContent(await renderElements([imageFrame(ROTATION)], submission), 0)

    // The motif is drawn in its own square, centred on the frame's shorter side.
    const size = Math.min(FRAME.width, FRAME.height)
    const motifBox = {
      x: FRAME.x + (FRAME.width - size) / 2,
      y: FRAME.y + (FRAME.height - size) / 2,
      width: size,
      height: size,
    }
    const expected = expectedQuad(motifBox, FRAME, ROTATION)
    for (const transform of content.pathTransforms) {
      expectQuadsToMatch(
        quad(transform, MOTIF_VIEWBOX, MOTIF_VIEWBOX),
        expected,
        "rotated filler art"
      )
    }
    expect(content.pathTransforms.length).toBeGreaterThan(0)
  })

  it("rotates a gallery as one frame, keeping its slots in the same relative places", async () => {
    const submission = submissionFixture("10000000-0000-4000-8000-000000000003", 1)
    submission.answers.photos = photoAnswers("left-photo", "right-photo")
    const gallery: LayoutElement = {
      id: "gallery",
      type: "gallery-frame",
      opacity: 1,
      geometry: { ...FRAME, rotation: ROTATION },
      questionId: "photos",
      arrangement: "two-portrait",
      gap: 4,
    }

    const content = await drawnContent(await renderElements([gallery], submission), 0)

    const slots = gallerySlots("two-portrait", FRAME.width, FRAME.height, 4)
    slots.forEach((slot, index) => {
      expectQuadsToMatch(
        content.clips[index],
        expectedQuad(
          { x: FRAME.x + slot.x, y: FRAME.y + slot.y, width: slot.width, height: slot.height },
          FRAME,
          ROTATION
        ),
        `rotated gallery slot ${index}`
      )
    })
  })

  it("turns a decorative image at the angle the preview shows", async () => {
    const submission = submissionFixture("10000000-0000-4000-8000-000000000004", 1)
    const decorative: LayoutElement = {
      id: "decoration",
      type: "decorative-image",
      opacity: 1,
      geometry: { ...FRAME, rotation: ROTATION },
      assetId: "decorative-asset",
      focalPoint: { x: 0.5, y: 0.5 },
    }

    const content = await drawnContent(await renderElements([decorative], submission), 0)

    expectQuadsToMatch(
      content.clips[0],
      expectedQuad(FRAME, FRAME, ROTATION),
      "rotated decorative image"
    )
  })
})
