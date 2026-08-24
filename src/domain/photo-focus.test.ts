import { describe, expect, it } from "vitest"

import {
  CENTRE_FOCAL_POINT,
  coverRect,
  effectiveFocalPoint,
  findPhoto,
  hiddenExtent,
  panFocalPoint,
  photoFocalPoint,
  sameFocalPoint,
  unrotateDelta,
  withPhotoFocalPoint,
} from "./photo-focus.ts"
import { type ImageAnswer, type LayoutElement, type SubmissionSummary } from "./types.ts"

function frame(focalPoint?: {
  x: number
  y: number
}): Extract<LayoutElement, { type: "image-frame" }> {
  return {
    id: "frame",
    type: "image-frame",
    geometry: { x: 0, y: 0, width: 40, height: 40, rotation: 0 },
    opacity: 1,
    questionId: "photos",
    cornerRadius: 0,
    focalPoint,
  }
}

function photo(assetId: string, focalPoint?: { x: number; y: number }): ImageAnswer {
  return {
    assetId,
    name: `${assetId}.jpg`,
    mimeType: "image/jpeg",
    width: 1000,
    height: 4000,
    sizeBytes: 1_000,
    focalPoint,
  }
}

describe("crop centre precedence", () => {
  it("lets a photo the organizer adjusted override the layout's own focus", () => {
    expect(effectiveFocalPoint(frame({ x: 0.8, y: 0.8 }), photo("a", { x: 0.5, y: 0.1 }))).toEqual({
      x: 0.5,
      y: 0.1,
    })
  })

  it("keeps the layout's focus for every photo nobody adjusted", () => {
    expect(effectiveFocalPoint(frame({ x: 0.8, y: 0.8 }), photo("a"))).toEqual({ x: 0.8, y: 0.8 })
    expect(effectiveFocalPoint(frame(), photo("a"))).toEqual(CENTRE_FOCAL_POINT)
    expect(effectiveFocalPoint(frame(), undefined)).toEqual(CENTRE_FOCAL_POINT)
  })
})

describe("cover crop geometry", () => {
  it("scales to cover and cuts the overflow according to the focal point", () => {
    const square = { width: 100, height: 100 }
    const wide = { width: 400, height: 100 }

    expect(coverRect(square, wide, CENTRE_FOCAL_POINT)).toEqual({
      x: -150,
      y: 0,
      width: 400,
      height: 100,
    })
    expect(coverRect(square, wide, { x: 0, y: 0.5 }).x).toBe(0)
    expect(coverRect(square, wide, { x: 1, y: 0.5 }).x).toBe(-300)
    expect(hiddenExtent(square, wide)).toEqual({ width: 300, height: 0 })
  })

  it("survives an image whose dimensions were never recorded", () => {
    expect(
      coverRect({ width: 80, height: 60 }, { width: 0, height: 0 }, CENTRE_FOCAL_POINT)
    ).toEqual({ x: 0, y: 0, width: 80, height: 60 })
  })
})

describe("panning a crop", () => {
  const square = { width: 100, height: 100 }
  const tall = { width: 100, height: 400 }

  it("reveals the top of a photo when it is dragged downwards", () => {
    expect(panFocalPoint(CENTRE_FOCAL_POINT, square, tall, 0, 30).y).toBeCloseTo(0.4)
  })

  it("stops at the edges of the photo", () => {
    expect(panFocalPoint(CENTRE_FOCAL_POINT, square, tall, 0, 1000)).toEqual({ x: 0.5, y: 0 })
    expect(panFocalPoint(CENTRE_FOCAL_POINT, square, tall, 0, -1000)).toEqual({ x: 0.5, y: 1 })
  })

  it("leaves an axis alone when the photo hides nothing along it", () => {
    expect(panFocalPoint({ x: 0.3, y: 0.5 }, square, tall, 50, 0).x).toBe(0.3)
  })

  it("pans along the frame's own axes once it is rotated", () => {
    const delta = unrotateDelta(10, 0, 90)
    expect(delta.width).toBeCloseTo(0)
    expect(delta.height).toBeCloseTo(-10)
    expect(unrotateDelta(10, 4, 0)).toEqual({ width: 10, height: 4 })
  })

  it("treats imperceptible differences as no change at all", () => {
    expect(sameFocalPoint({ x: 0.5, y: 0.5 }, { x: 0.5001, y: 0.5 })).toBe(true)
    expect(sameFocalPoint({ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 })).toBe(false)
    expect(sameFocalPoint(undefined, { x: 0.5, y: 0.5 })).toBe(false)
    expect(sameFocalPoint(undefined, undefined)).toBe(true)
  })
})

describe("applying a crop centre across a response", () => {
  const submissions: SubmissionSummary[] = [
    {
      id: "first",
      sequence: 1,
      submittedAt: "2026-07-18T00:00:00.000Z",
      answers: { memory: "A note", photos: [photo("left"), photo("right")] },
    },
    {
      id: "second",
      sequence: 2,
      submittedAt: "2026-07-19T00:00:00.000Z",
      answers: { photos: [photo("other")] },
    },
  ]

  it("adjusts one photo and leaves every other answer untouched", () => {
    const updated = withPhotoFocalPoint(submissions, "right", { x: 0.5, y: 0.2 })

    expect(photoFocalPoint(updated, "right")).toEqual({ x: 0.5, y: 0.2 })
    expect(photoFocalPoint(updated, "left")).toBeUndefined()
    expect(updated[0]!.answers.memory).toBe("A note")
    expect(updated[1]).toBe(submissions[1])
  })

  it("clears a crop centre back to the layout's focus", () => {
    const adjusted = withPhotoFocalPoint(submissions, "other", { x: 0.1, y: 0.9 })

    expect(
      photoFocalPoint(withPhotoFocalPoint(adjusted, "other", undefined), "other")
    ).toBeUndefined()
  })

  it("finds the photo behind an asset so the review can name it", () => {
    expect(findPhoto(submissions, "other")?.name).toBe("other.jpg")
    expect(findPhoto(submissions, "missing")).toBeUndefined()
  })
})
