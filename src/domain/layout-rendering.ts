import { PAGE_SPEC } from "./layout.ts"
import { type PageSpecification } from "./page-format.ts"
import { type RelativeGeometry } from "./types.ts"

export const POINT_TO_MM = 25.4 / 72

export interface MediaGeometry extends RelativeGeometry {}

export interface PercentageGeometry {
  left: number
  top: number
  width: number
  height: number
  rotation: number
}

export function canonicalToMediaGeometry(
  geometry: RelativeGeometry,
  mediaWidth: number,
  specification: PageSpecification = PAGE_SPEC
): MediaGeometry {
  const scale = mediaWidth / specification.mediaWidthMm
  return {
    x: (geometry.x + specification.bleedMm) * scale,
    y: (geometry.y + specification.bleedMm) * scale,
    width: geometry.width * scale,
    height: geometry.height * scale,
    rotation: geometry.rotation,
  }
}

export function mediaToCanonicalGeometry(
  geometry: RelativeGeometry,
  mediaWidth: number,
  specification: PageSpecification = PAGE_SPEC
): RelativeGeometry {
  const scale = specification.mediaWidthMm / mediaWidth
  const round = (value: number) => Math.round(value * 10_000) / 10_000
  return {
    x: round(geometry.x * scale - specification.bleedMm),
    y: round(geometry.y * scale - specification.bleedMm),
    width: round(geometry.width * scale),
    height: round(geometry.height * scale),
    rotation: round(geometry.rotation),
  }
}

export function canonicalToPercentageGeometry(
  geometry: RelativeGeometry,
  specification: PageSpecification = PAGE_SPEC
): PercentageGeometry {
  return {
    left: ((geometry.x + specification.bleedMm) / specification.mediaWidthMm) * 100,
    top: ((geometry.y + specification.bleedMm) / specification.mediaHeightMm) * 100,
    width: (geometry.width / specification.mediaWidthMm) * 100,
    height: (geometry.height / specification.mediaHeightMm) * 100,
    rotation: geometry.rotation,
  }
}

export function millimetresToMediaPixels(
  value: number,
  mediaWidth: number,
  specification: PageSpecification = PAGE_SPEC
): number {
  return value * (mediaWidth / specification.mediaWidthMm)
}

export function millimetresToContainerWidth(
  value: number,
  specification: PageSpecification = PAGE_SPEC
): string {
  return `${(value / specification.mediaWidthMm) * 100}cqw`
}

export function pointsToContainerWidth(
  value: number,
  specification: PageSpecification = PAGE_SPEC
): string {
  return millimetresToContainerWidth(value * POINT_TO_MM, specification)
}
