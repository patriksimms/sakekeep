import { PAGE_SPEC } from "./layout.ts"
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
  mediaWidth: number
): MediaGeometry {
  const scale = mediaWidth / PAGE_SPEC.mediaWidthMm
  return {
    x: (geometry.x + PAGE_SPEC.bleedMm) * scale,
    y: (geometry.y + PAGE_SPEC.bleedMm) * scale,
    width: geometry.width * scale,
    height: geometry.height * scale,
    rotation: geometry.rotation,
  }
}

export function mediaToCanonicalGeometry(
  geometry: RelativeGeometry,
  mediaWidth: number
): RelativeGeometry {
  const scale = PAGE_SPEC.mediaWidthMm / mediaWidth
  const round = (value: number) => Math.round(value * 10_000) / 10_000
  return {
    x: round(geometry.x * scale - PAGE_SPEC.bleedMm),
    y: round(geometry.y * scale - PAGE_SPEC.bleedMm),
    width: round(geometry.width * scale),
    height: round(geometry.height * scale),
    rotation: round(geometry.rotation),
  }
}

export function canonicalToPercentageGeometry(geometry: RelativeGeometry): PercentageGeometry {
  return {
    left: ((geometry.x + PAGE_SPEC.bleedMm) / PAGE_SPEC.mediaWidthMm) * 100,
    top: ((geometry.y + PAGE_SPEC.bleedMm) / PAGE_SPEC.mediaHeightMm) * 100,
    width: (geometry.width / PAGE_SPEC.mediaWidthMm) * 100,
    height: (geometry.height / PAGE_SPEC.mediaHeightMm) * 100,
    rotation: geometry.rotation,
  }
}

export function millimetresToMediaPixels(value: number, mediaWidth: number): number {
  return value * (mediaWidth / PAGE_SPEC.mediaWidthMm)
}

export function millimetresToContainerWidth(value: number): string {
  return `${(value / PAGE_SPEC.mediaWidthMm) * 100}cqw`
}

export function pointsToContainerWidth(value: number): string {
  return millimetresToContainerWidth(value * POINT_TO_MM)
}
