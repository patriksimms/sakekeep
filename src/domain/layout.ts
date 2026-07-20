import { z } from "zod"

import {
  LAYOUT_SCHEMA_VERSION,
  type GalleryArrangement,
  type LayoutElement,
  type LayoutSchema,
  type RelativeGeometry,
  type TextSettings,
} from "./types"

export const PAGE_SPEC = {
  trimWidthMm: 210,
  trimHeightMm: 148,
  bleedMm: 3,
  safeMarginMm: 6,
  mediaWidthMm: 216,
  mediaHeightMm: 154,
} as const

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
  fontFamily: z.union([z.literal("Inter"), z.literal("Source Serif 4")]),
  fontSize: finite.min(4).max(200),
  minFontSize: finite.min(4).max(200),
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
    assetId: z.string().min(1),
    focalPoint: focalPointSchema,
  }),
])

export const layoutSchemaValidator = z
  .object({
    version: z.literal(LAYOUT_SCHEMA_VERSION),
    trim: z.object({
      widthMm: z.literal(210),
      heightMm: z.literal(148),
    }),
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

export function emptyLayoutSchema(): LayoutSchema {
  return {
    version: LAYOUT_SCHEMA_VERSION,
    trim: { widthMm: 210, heightMm: 148 },
    bleedMm: 3,
    safeMarginMm: 6,
    background: "#fffdf7",
    elements: [],
  }
}

export function mmToCanvas(geometry: RelativeGeometry, editorWidth: number): RelativeGeometry {
  const scale = editorWidth / PAGE_SPEC.trimWidthMm
  return {
    x: geometry.x * scale,
    y: geometry.y * scale,
    width: geometry.width * scale,
    height: geometry.height * scale,
    rotation: geometry.rotation,
  }
}

export function canvasToMm(geometry: RelativeGeometry, editorWidth: number): RelativeGeometry {
  const scale = PAGE_SPEC.trimWidthMm / editorWidth
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

export function elementExtendsBeyondBleed(element: LayoutElement): boolean {
  const { x, y, width, height } = element.geometry
  return (
    x < -PAGE_SPEC.bleedMm ||
    y < -PAGE_SPEC.bleedMm ||
    x + width > PAGE_SPEC.trimWidthMm + PAGE_SPEC.bleedMm ||
    y + height > PAGE_SPEC.trimHeightMm + PAGE_SPEC.bleedMm
  )
}

export function isCriticalElementOutsideSafeArea(element: LayoutElement): boolean {
  if (element.type !== "bound-text" && element.type !== "static-text" && element.type !== "line") {
    return false
  }
  const { x, y, width, height } = element.geometry
  return (
    x < PAGE_SPEC.safeMarginMm ||
    y < PAGE_SPEC.safeMarginMm ||
    x + width > PAGE_SPEC.trimWidthMm - PAGE_SPEC.safeMarginMm ||
    y + height > PAGE_SPEC.trimHeightMm - PAGE_SPEC.safeMarginMm
  )
}

export function addElement(
  schema: LayoutSchema,
  type: LayoutElement["type"],
  questionId?: string
): LayoutSchema {
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
        assetId: "",
        focalPoint: { x: 0.5, y: 0.5 },
      }
      break
  }
  return { ...schema, elements: [...schema.elements, element] }
}
