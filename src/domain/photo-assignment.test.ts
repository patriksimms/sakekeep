import { describe, expect, it } from "vitest"

import { assignPhotosToFrames, photoSlotMismatches } from "./photo-assignment.ts"
import {
  type FormQuestion,
  type GalleryArrangement,
  type ImageAnswer,
  type LayoutElement,
} from "./types.ts"

function photo(assetId: string): ImageAnswer {
  return {
    assetId,
    name: `${assetId}.jpg`,
    mimeType: "image/jpeg",
    width: 3000,
    height: 2000,
    sizeBytes: 1000,
  }
}

function imageFrame(id: string, questionId: string, x: number, y: number): LayoutElement {
  return {
    id,
    type: "image-frame",
    questionId,
    cornerRadius: 0,
    opacity: 1,
    geometry: { x, y, width: 40, height: 30, rotation: 0 },
  }
}

function galleryFrame(
  id: string,
  questionId: string,
  x: number,
  y: number,
  arrangement: GalleryArrangement
): LayoutElement {
  return {
    id,
    type: "gallery-frame",
    questionId,
    arrangement,
    gap: 2,
    opacity: 1,
    geometry: { x, y, width: 60, height: 40, rotation: 0 },
  }
}

/** Which photo landed in which slot, keyed by frame, for readable expectations. */
function placement(elements: LayoutElement[], answers: Record<string, ImageAnswer[]>) {
  const assignment = assignPhotosToFrames(elements, answers)
  return Object.fromEntries(
    [...assignment.byElement].map(([elementId, photos]) => [
      elementId,
      photos.map((image) => image?.assetId ?? null),
    ])
  )
}

describe("photo distribution across frames", () => {
  it("gives every frame bound to one question a different photo", () => {
    const elements = [
      imageFrame("top", "photos", 10, 10),
      imageFrame("middle", "photos", 10, 50),
      imageFrame("bottom", "photos", 10, 90),
    ]
    const photos = { photos: [photo("a"), photo("b"), photo("c")] }

    expect(placement(elements, photos)).toEqual({
      top: ["a"],
      middle: ["b"],
      bottom: ["c"],
    })
    expect(assignPhotosToFrames(elements, photos).questions).toEqual([
      {
        questionId: "photos",
        photoCount: 3,
        slotCount: 3,
        unplacedPhotoCount: 0,
        emptySlotCount: 0,
      },
    ])
  })

  it("fills frames in reading order and leaves the trailing frames empty", () => {
    const elements = [
      imageFrame("bottom-right", "photos", 90, 60),
      imageFrame("top-right", "photos", 90, 10),
      imageFrame("bottom-left", "photos", 10, 60),
      imageFrame("top-left", "photos", 10, 10),
      imageFrame("middle", "photos", 50, 35),
    ]
    const photos = { photos: [photo("a"), photo("b"), photo("c"), photo("d")] }

    expect(placement(elements, photos)).toEqual({
      "top-left": ["a"],
      "top-right": ["b"],
      middle: ["c"],
      "bottom-left": ["d"],
      "bottom-right": [null],
    })
    expect(assignPhotosToFrames(elements, photos).questions[0]).toMatchObject({
      slotCount: 5,
      photoCount: 4,
      emptySlotCount: 1,
      unplacedPhotoCount: 0,
    })
  })

  it("places as many photos as there are slots and reports the rest as unplaced", () => {
    const elements = [
      imageFrame("hero", "photos", 10, 10),
      galleryFrame("strip", "photos", 10, 50, "three-column"),
    ]
    const photos = {
      photos: ["a", "b", "c", "d", "e", "f"].map(photo),
    }

    expect(placement(elements, photos)).toEqual({
      hero: ["a"],
      strip: ["b", "c", "d"],
    })
    expect(assignPhotosToFrames(elements, photos).questions[0]).toMatchObject({
      slotCount: 4,
      photoCount: 6,
      unplacedPhotoCount: 2,
      emptySlotCount: 0,
    })
  })

  it("gives a gallery a contiguous block at its place in the reading order", () => {
    const elements = [
      galleryFrame("gallery", "photos", 10, 50, "two-portrait"),
      imageFrame("above", "photos", 10, 10),
      imageFrame("below", "photos", 10, 100),
    ]

    expect(placement(elements, { photos: ["a", "b", "c", "d"].map(photo) })).toEqual({
      above: ["a"],
      gallery: ["b", "c"],
      below: ["d"],
    })
  })

  it("scopes distribution to each question", () => {
    const elements = [
      imageFrame("portrait", "people", 10, 10),
      imageFrame("place-one", "places", 60, 10),
      imageFrame("place-two", "places", 60, 50),
    ]

    expect(
      placement(elements, {
        people: [photo("face")],
        places: [photo("beach"), photo("forest")],
      })
    ).toEqual({
      portrait: ["face"],
      "place-one": ["beach"],
      "place-two": ["forest"],
    })
  })

  it("keeps the mapping stable when frames are relayered or duplicated", () => {
    const elements = [
      imageFrame("alpha", "photos", 10, 10),
      imageFrame("beta", "photos", 10, 10),
      imageFrame("gamma", "photos", 60, 10),
    ]
    const photos = { photos: [photo("a"), photo("b"), photo("c")] }
    const expected = { alpha: ["a"], beta: ["b"], gamma: ["c"] }

    expect(placement(elements, photos)).toEqual(expected)
    expect(placement([...elements].reverse(), photos)).toEqual(expected)
  })

  it("ignores answers that are not uploaded photos", () => {
    const elements = [imageFrame("frame", "photos", 10, 10)]

    expect(placement(elements, { photos: ["not-a-photo"] as unknown as ImageAnswer[] })).toEqual({
      frame: [null],
    })
  })
})

describe("design-time photo slot mismatches", () => {
  const question = (maxImages: number): FormQuestion => ({
    id: "photos",
    type: "images",
    prompt: "Photos",
    required: false,
    maxImages,
  })

  it("reports a layout that cannot show every allowed upload", () => {
    const elements = [imageFrame("frame", "photos", 10, 10)]

    expect(photoSlotMismatches(elements, [question(3)])).toEqual([
      { questionId: "photos", slotCount: 1, maxImages: 3 },
    ])
  })

  it("reports a layout with more slots than a contributor may upload", () => {
    const elements = [
      imageFrame("frame", "photos", 10, 10),
      galleryFrame("gallery", "photos", 10, 50, "four-square"),
    ]

    expect(photoSlotMismatches(elements, [question(2)])).toEqual([
      { questionId: "photos", slotCount: 5, maxImages: 2 },
    ])
  })

  it("stays quiet when the slots match, and for questions this layout does not use", () => {
    const matching = [imageFrame("frame", "photos", 10, 10), imageFrame("second", "photos", 60, 10)]

    expect(photoSlotMismatches(matching, [question(2)])).toEqual([])
    expect(photoSlotMismatches([], [question(2)])).toEqual([])
  })
})
