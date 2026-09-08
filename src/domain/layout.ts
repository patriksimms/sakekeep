import * as m from "#/paraglide/messages.js"
import { type Locale } from "#/lib/locale.ts"
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
  // The complete layout validator applies format-aware bounds. These storage bounds
  // accommodate every proportional A4/A5/A6 transform.
  x: finite.min(-5000).max(5000),
  y: finite.min(-5000).max(5000),
  width: finite.positive().max(5000),
  height: finite.positive().max(5000),
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
  // Format-aware bounds are applied by the complete layout validator below.
  fontSize: finite.min(1).max(500),
  minFontSize: finite.min(1).max(500),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fontStyle: z.union([z.literal("normal"), z.literal("italic")]),
  fontWeight: z.union([z.literal("normal"), z.literal("bold")]),
  alignment: z.union([z.literal("left"), z.literal("center"), z.literal("right")]),
  // Defaulted rather than required so layouts persisted before vertical alignment existed
  // keep loading, and keep rendering exactly where they always did.
  verticalAlignment: z
    .union([z.literal("top"), z.literal("middle"), z.literal("bottom")])
    .default("top"),
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
    cornerRadius: finite.min(0).max(500),
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
    gap: finite.min(0).max(500),
    focalPoint: focalPointSchema.optional(),
  }),
  baseElement.extend({
    type: z.union([z.literal("rectangle"), z.literal("circle"), z.literal("line")]),
    fill: z.string(),
    stroke: z.string(),
    strokeWidth: finite.min(0).max(500),
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
    const specification = pageSpecificationForLayout(layout)
    const limits = layoutStyleLimits(specification)
    const geometryLimits = layoutGeometryLimits(specification)
    const checkRange = (
      value: number,
      minimum: number,
      maximum: number,
      path: (string | number)[],
      label: string
    ) => {
      if (value >= minimum - 0.0001 && value <= maximum + 0.0001) return
      context.addIssue({
        code: "custom",
        path,
        message: m.geometry_limit({
          value0: label,
          value1: round(minimum),
          value2: round(maximum),
        }),
      })
    }
    for (const [index, element] of layout.elements.entries()) {
      if (ids.has(element.id)) {
        context.addIssue({
          code: "custom",
          path: ["elements", index, "id"],
          message: m.ui_element_ids_must_be_unique(),
        })
      }
      ids.add(element.id)
      checkRange(
        element.geometry.x,
        geometryLimits.x.min,
        geometryLimits.x.max,
        ["elements", index, "geometry", "x"],
        m.ui_horizontal_position()
      )
      checkRange(
        element.geometry.y,
        geometryLimits.y.min,
        geometryLimits.y.max,
        ["elements", index, "geometry", "y"],
        m.ui_vertical_position()
      )
      checkRange(
        element.geometry.width,
        Number.MIN_VALUE,
        geometryLimits.widthMax,
        ["elements", index, "geometry", "width"],
        m.ui_width()
      )
      checkRange(
        element.geometry.height,
        Number.MIN_VALUE,
        geometryLimits.heightMax,
        ["elements", index, "geometry", "height"],
        m.ui_height()
      )
      if ("text" in element && element.text.minFontSize > element.text.fontSize) {
        context.addIssue({
          code: "custom",
          path: ["elements", index, "text", "minFontSize"],
          message: m.ui_minimum_font_size_cannot_exceed_the_font_size(),
        })
      }
      if ("text" in element) {
        checkRange(
          element.text.fontSize,
          limits.fontSize.min,
          limits.fontSize.max,
          ["elements", index, "text", "fontSize"],
          m.ui_font_size()
        )
        checkRange(
          element.text.minFontSize,
          limits.fontSize.min,
          limits.fontSize.max,
          ["elements", index, "text", "minFontSize"],
          m.ui_minimum_font_size()
        )
      }
      if (element.type === "image-frame") {
        checkRange(
          element.cornerRadius,
          0,
          limits.cornerRadiusMax,
          ["elements", index, "cornerRadius"],
          m.ui_corner_radius()
        )
      }
      if (element.type === "gallery-frame") {
        checkRange(element.gap, 0, limits.gapMax, ["elements", index, "gap"], m.ui_gallery_gap())
      }
      if (element.type === "rectangle" || element.type === "circle" || element.type === "line") {
        checkRange(
          element.strokeWidth,
          0,
          limits.strokeWidthMax,
          ["elements", index, "strokeWidth"],
          m.ui_stroke_width()
        )
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
  verticalAlignment: "top",
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
  center?: { x: number; y: number },
  locale: Locale = "en"
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
        content: m.little_note({}, { locale }),
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

export function layoutStyleLimits(specification: PageSpecification) {
  const a5Width = specification.orientation === "portrait" ? 148 : 210
  const scale = specification.trimWidthMm / a5Width
  return {
    fontSize: { min: round(4 * scale), max: round(200 * scale) },
    cornerRadiusMax: round(100 * scale),
    gapMax: round(50 * scale),
    strokeWidthMax: round(100 * scale),
  }
}

export function layoutGeometryLimits(specification: PageSpecification) {
  const canonical = pageSpecification("a5", specification.orientation)
  const scale = specification.trimWidthMm / canonical.trimWidthMm
  const offsetX = (specification.mediaWidthMm - canonical.mediaWidthMm * scale) / 2
  const offsetY = (specification.mediaHeightMm - canonical.mediaHeightMm * scale) / 2
  const transformX = (value: number) =>
    (value + canonical.bleedMm) * scale + offsetX - specification.bleedMm
  const transformY = (value: number) =>
    (value + canonical.bleedMm) * scale + offsetY - specification.bleedMm

  return {
    x: { min: transformX(-1000), max: transformX(1000) },
    y: { min: transformY(-1000), max: transformY(1000) },
    widthMax: 2000 * scale,
    heightMax: 2000 * scale,
  }
}

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
        : element.geometry.width * scale
      const height = touchesBottomBleed
        ? round(target.trimHeightMm + target.bleedMm - y)
        : element.geometry.height * scale
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
        return { ...resized, cornerRadius: round(resized.cornerRadius * scale) }
      }
      if (resized.type === "gallery-frame") {
        return { ...resized, gap: round(resized.gap * scale) }
      }
      if (resized.type === "rectangle" || resized.type === "circle" || resized.type === "line") {
        return { ...resized, strokeWidth: round(resized.strokeWidth * scale) }
      }
      return resized
    }),
  }
}
