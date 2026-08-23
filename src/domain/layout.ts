import { z } from "zod"

import { FONT_FAMILY_IDS } from "./fonts.ts"
import {
  LAYOUT_SCHEMA_VERSION,
  type GalleryArrangement,
  type LayoutElement,
  type LayoutSchema,
  type RelativeGeometry,
  type TextSettings,
} from "./types"
import {
  pageSpecification,
  pageSpecificationForLayout,
  type PageSpecification,
} from "./page-format.ts"

export const PAGE_SPEC = pageSpecification()

const finite = z.number().finite()
const geometrySchema = z.object({
  x: finite.min(-1000).max(1000),
  y: finite.min(-1000).max(1000),
  width: finite.positive().max(2000),
  height: finite.positive().max(2000),
  rotation: finite.min(-36000).max(36000),
})

const baseElement = z.object({
  id: z.string().min(1).max(100),
  geometry: geometrySchema,
  opacity: finite.min(0).max(1),
  locked: z.boolean().optional(),
})

const focalPointSchema = z.object({
  x: finite.min(0).max(1),
  y: finite.min(0).max(1),
})

const textSettingsSchema = z.object({
  fontFamily: z.enum(FONT_FAMILY_IDS),
  // Project-wide resizing can move the editable 4–200 pt range beyond those bounds. The storage
  // range covers the largest A6 → A4 and smallest A4 → A6 proportional results.
  fontSize: finite.min(1).max(500),
  minFontSize: finite.min(1).max(500),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fontStyle: z.union([z.literal("normal"), z.literal("italic")]),
  fontWeight: z.union([z.literal("normal"), z.literal("bold")]),
  alignment: z.union([z.literal("left"), z.literal("center"), z.literal("right")]),
  lineHeight: finite.min(0.5).max(4),
  overflow: z.union([z.literal("shrink"), z.literal("truncate"), z.literal("flag")]),
})

export const layoutElementSchema = z.discriminatedUnion("type", [
  baseElement.extend({
    type: z.literal("bound-text"),
    questionId: z.string().min(1),
    showLabel: z.boolean(),
    label: z.string().max(500).optional(),
    text: textSettingsSchema,
  }),
  baseElement.extend({
    type: z.literal("static-text"),
    content: z.string().max(100_000),
    text: textSettingsSchema,
  }),
  baseElement.extend({
    type: z.literal("image-frame"),
    questionId: z.string().min(1),
    cornerRadius: finite.min(0).max(100),
    focalPoint: focalPointSchema.optional(),
  }),
  baseElement.extend({
    type: z.literal("gallery-frame"),
    questionId: z.string().min(1),
    arrangement: z.union([
      z.literal("two-portrait"),
      z.literal("four-square"),
      z.literal("hero-two"),
      z.literal("three-column"),
    ]),
    gap: finite.min(0).max(50),
    focalPoint: focalPointSchema.optional(),
  }),
  baseElement.extend({
    type: z.union([z.literal("rectangle"), z.literal("circle"), z.literal("line")]),
    fill: z.string(),
    stroke: z.string(),
    strokeWidth: finite.min(0).max(100),
  }),
  baseElement.extend({
    type: z.literal("decorative-image"),
    assetId: z.string().min(1).optional(),
    focalPoint: focalPointSchema,
  }),
])

export const layoutSchemaValidator = z
  .object({
    version: z.literal(LAYOUT_SCHEMA_VERSION),
    trim: z.union([
      z.object({ widthMm: z.literal(210), heightMm: z.literal(297) }),
      z.object({ widthMm: z.literal(297), heightMm: z.literal(210) }),
      z.object({ widthMm: z.literal(148), heightMm: z.literal(210) }),
      z.object({ widthMm: z.literal(210), heightMm: z.literal(148) }),
      z.object({ widthMm: z.literal(105), heightMm: z.literal(148) }),
      z.object({ widthMm: z.literal(148), heightMm: z.literal(105) }),
    ]),
    bleedMm: z.literal(3),
    safeMarginMm: z.literal(6),
    background: z.string(),
    elements: z.array(layoutElementSchema).max(500),
  })
  .superRefine((layout, context) => {
    const ids = new Set<string>()
    for (const [index, element] of layout.elements.entries()) {
      if (ids.has(element.id)) {
        context.addIssue({
          code: "custom",
          path: ["elements", index, "id"],
          message: "Element IDs must be unique.",
        })
      }
      ids.add(element.id)
      if ("text" in element && element.text.minFontSize > element.text.fontSize) {
        context.addIssue({
          code: "custom",
          path: ["elements", index, "text", "minFontSize"],
          message: "Minimum font size cannot exceed the font size.",
        })
      }
    }
  })

export const DEFAULT_TEXT_SETTINGS: TextSettings = {
  fontFamily: "Inter",
  fontSize: 16,
  minFontSize: 8,
  color: "#292524",
  fontStyle: "normal",
  fontWeight: "normal",
  alignment: "left",
  lineHeight: 1.25,
  overflow: "flag",
}

export function emptyLayoutSchema(
  format: import("./types.ts").PageFormat = "a5",
  orientation: import("./types.ts").PageOrientation = "landscape"
): LayoutSchema {
  const specification = pageSpecification(format, orientation)
  return {
    version: LAYOUT_SCHEMA_VERSION,
    trim: {
      widthMm: specification.trimWidthMm,
      heightMm: specification.trimHeightMm,
    },
    bleedMm: 3,
    safeMarginMm: 6,
    background: "#fffdf7",
    elements: [],
  }
}

export function mmToCanvas(
  geometry: RelativeGeometry,
  editorWidth: number,
  specification: PageSpecification = PAGE_SPEC
): RelativeGeometry {
  const scale = editorWidth / specification.trimWidthMm
  return {
    x: geometry.x * scale,
    y: geometry.y * scale,
    width: geometry.width * scale,
    height: geometry.height * scale,
    rotation: geometry.rotation,
  }
}

export function canvasToMm(
  geometry: RelativeGeometry,
  editorWidth: number,
  specification: PageSpecification = PAGE_SPEC
): RelativeGeometry {
  const scale = specification.trimWidthMm / editorWidth
  return {
    x: geometry.x * scale,
    y: geometry.y * scale,
    width: geometry.width * scale,
    height: geometry.height * scale,
    rotation: geometry.rotation,
  }
}

export interface GallerySlot {
  x: number
  y: number
  width: number
  height: number
}

export function gallerySlots(
  arrangement: GalleryArrangement,
  width: number,
  height: number,
  gap: number
): GallerySlot[] {
  switch (arrangement) {
    case "two-portrait":
      return [
        { x: 0, y: 0, width: (width - gap) / 2, height },
        {
          x: (width + gap) / 2,
          y: 0,
          width: (width - gap) / 2,
          height,
        },
      ]
    case "four-square":
      return [
        { x: 0, y: 0, width: (width - gap) / 2, height: (height - gap) / 2 },
        {
          x: (width + gap) / 2,
          y: 0,
          width: (width - gap) / 2,
          height: (height - gap) / 2,
        },
        {
          x: 0,
          y: (height + gap) / 2,
          width: (width - gap) / 2,
          height: (height - gap) / 2,
        },
        {
          x: (width + gap) / 2,
          y: (height + gap) / 2,
          width: (width - gap) / 2,
          height: (height - gap) / 2,
        },
      ]
    case "hero-two":
      return [
        { x: 0, y: 0, width: width * 0.62 - gap / 2, height },
        {
          x: width * 0.62 + gap / 2,
          y: 0,
          width: width * 0.38 - gap / 2,
          height: (height - gap) / 2,
        },
        {
          x: width * 0.62 + gap / 2,
          y: (height + gap) / 2,
          width: width * 0.38 - gap / 2,
          height: (height - gap) / 2,
        },
      ]
    case "three-column":
      return [0, 1, 2].map((index) => ({
        x: index * ((width + gap) / 3),
        y: 0,
        width: (width - gap * 2) / 3,
        height,
      }))
  }
}

export function elementExtendsBeyondBleed(
  element: LayoutElement,
  specification: PageSpecification = PAGE_SPEC
): boolean {
  const { x, y, width, height } = element.geometry
  return (
    x < -specification.bleedMm ||
    y < -specification.bleedMm ||
    x + width > specification.trimWidthMm + specification.bleedMm ||
    y + height > specification.trimHeightMm + specification.bleedMm
  )
}

export function isCriticalElementOutsideSafeArea(
  element: LayoutElement,
  specification: PageSpecification = PAGE_SPEC
): boolean {
  if (element.type !== "bound-text" && element.type !== "static-text" && element.type !== "line") {
    return false
  }
  const { x, y, width, height } = element.geometry
  return (
    x < specification.safeMarginMm ||
    y < specification.safeMarginMm ||
    x + width > specification.trimWidthMm - specification.safeMarginMm ||
    y + height > specification.trimHeightMm - specification.safeMarginMm
  )
}

export function addElement(
  schema: LayoutSchema,
  type: LayoutElement["type"],
  questionId?: string,
  center?: { x: number; y: number }
): LayoutSchema {
  const specification = pageSpecificationForLayout(schema)
  const id = crypto.randomUUID()
  const geometry = { x: 20, y: 20, width: 70, height: 35, rotation: 0 }
  let element: LayoutElement
  switch (type) {
    case "bound-text":
      element = {
        id,
        type,
        geometry,
        opacity: 1,
        questionId: questionId ?? "",
        showLabel: true,
        text: { ...DEFAULT_TEXT_SETTINGS },
      }
      break
    case "static-text":
      element = {
        id,
        type,
        geometry,
        opacity: 1,
        content: "A little note",
        text: { ...DEFAULT_TEXT_SETTINGS },
      }
      break
    case "image-frame":
      element = {
        id,
        type,
        geometry,
        opacity: 1,
        questionId: questionId ?? "",
        cornerRadius: 2,
        focalPoint: { x: 0.5, y: 0.5 },
      }
      break
    case "gallery-frame":
      element = {
        id,
        type,
        geometry: { ...geometry, width: 100, height: 65 },
        opacity: 1,
        questionId: questionId ?? "",
        arrangement: "four-square",
        gap: 3,
        focalPoint: { x: 0.5, y: 0.5 },
      }
      break
    case "rectangle":
    case "circle":
    case "line":
      element = {
        id,
        type,
        geometry,
        opacity: 1,
        fill: type === "line" ? "transparent" : "#efe7da",
        stroke: "#554d43",
        strokeWidth: 0.5,
      }
      break
    case "decorative-image":
      element = {
        id,
        type,
        geometry,
        opacity: 1,
        focalPoint: { x: 0.5, y: 0.5 },
      }
      break
  }
  if (center) {
    const { width, height } = element.geometry
    element.geometry = {
      ...element.geometry,
      x: Math.min(
        specification.trimWidthMm + specification.bleedMm - width,
        Math.max(-specification.bleedMm, center.x - width / 2)
      ),
      y: Math.min(
        specification.trimHeightMm + specification.bleedMm - height,
        Math.max(-specification.bleedMm, center.y - height / 2)
      ),
    }
  }
  return { ...schema, elements: [...schema.elements, element] }
}

const round = (value: number) => Math.round(value * 10_000) / 10_000

export function resizeLayoutSchema(schema: LayoutSchema, target: PageSpecification): LayoutSchema {
  const source = pageSpecificationForLayout(schema)
  // DIN's integer millimetre dimensions are only approximately proportional. Using one canonical
  // axis keeps the transform path-independent and makes repeated size changes reversible.
  const scale = target.trimWidthMm / source.trimWidthMm
  const offsetX = (target.mediaWidthMm - source.mediaWidthMm * scale) / 2
  const offsetY = (target.mediaHeightMm - source.mediaHeightMm * scale) / 2

  return {
    ...schema,
    trim: { widthMm: target.trimWidthMm, heightMm: target.trimHeightMm },
    elements: schema.elements.map((element) => {
      const touchesLeftBleed = Math.abs(element.geometry.x + source.bleedMm) < 0.0001
      const touchesTopBleed = Math.abs(element.geometry.y + source.bleedMm) < 0.0001
      const touchesRightBleed =
        Math.abs(
          element.geometry.x + element.geometry.width - (source.trimWidthMm + source.bleedMm)
        ) < 0.0001
      const touchesBottomBleed =
        Math.abs(
          element.geometry.y + element.geometry.height - (source.trimHeightMm + source.bleedMm)
        ) < 0.0001
      const x = touchesLeftBleed
        ? -target.bleedMm
        : round((element.geometry.x + source.bleedMm) * scale + offsetX - target.bleedMm)
      const y = touchesTopBleed
        ? -target.bleedMm
        : round((element.geometry.y + source.bleedMm) * scale + offsetY - target.bleedMm)
      const width = touchesRightBleed
        ? round(target.trimWidthMm + target.bleedMm - x)
        : round(element.geometry.width * scale)
      const height = touchesBottomBleed
        ? round(target.trimHeightMm + target.bleedMm - y)
        : round(element.geometry.height * scale)
      const resized = {
        ...element,
        geometry: {
          ...element.geometry,
          x,
          y,
          width,
          height,
        },
      }
      if (resized.type === "bound-text" || resized.type === "static-text") {
        return {
          ...resized,
          text: {
            ...resized.text,
            fontSize: round(resized.text.fontSize * scale),
            minFontSize: round(resized.text.minFontSize * scale),
          },
        }
      }
      if (resized.type === "image-frame") {
        return { ...resized, cornerRadius: Math.min(100, round(resized.cornerRadius * scale)) }
      }
      if (resized.type === "gallery-frame") {
        return { ...resized, gap: Math.min(50, round(resized.gap * scale)) }
      }
      if (resized.type === "rectangle" || resized.type === "circle" || resized.type === "line") {
        return { ...resized, strokeWidth: Math.min(100, round(resized.strokeWidth * scale)) }
      }
      return resized
    }),
  }
}
