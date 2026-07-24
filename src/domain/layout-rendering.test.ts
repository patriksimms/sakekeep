import { describe, expect, it } from "vitest"

import {
  canonicalToMediaGeometry,
  canonicalToPercentageGeometry,
  mediaToCanonicalGeometry,
  millimetresToContainerWidth,
  millimetresToMediaPixels,
  pointsToContainerWidth,
} from "./layout-rendering.ts"

describe("shared browser layout rendering", () => {
  const geometry = {
    x: -2.5,
    y: 13.25,
    width: 84.5,
    height: 47.75,
    rotation: 17,
  }

  it("round-trips canonical trim coordinates through the 216 mm media page", () => {
    for (const mediaWidth of [864, 648, 432]) {
      expect(
        mediaToCanonicalGeometry(canonicalToMediaGeometry(geometry, mediaWidth), mediaWidth)
      ).toEqual(geometry)
    }
  })

  it("uses the bleed-offset media coordinate system for CSS percentages", () => {
    expect(
      canonicalToPercentageGeometry({
        x: -3,
        y: -3,
        width: 216,
        height: 154,
        rotation: -12,
      })
    ).toEqual({ left: 0, top: 0, width: 100, height: 100, rotation: -12 })
  })

  it("scales typography, borders, gaps, and radii from physical units", () => {
    expect(millimetresToMediaPixels(3, 864)).toBe(12)
    expect(millimetresToContainerWidth(2)).toBe(`${(2 / 216) * 100}cqw`)
    expect(pointsToContainerWidth(18)).toBe(`${((18 * 25.4) / 72 / 216) * 100}cqw`)
  })
})
