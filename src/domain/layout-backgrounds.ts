import * as m from "#/paraglide/messages.js"
import { emptyLayoutSchema, resizeLayoutSchema } from "./layout.ts"
import { pageSpecification } from "./page-format.ts"
import {
  type LayoutSchema,
  type PageFormat,
  type PageOrientation,
  type ShapeElement,
} from "./types.ts"

export const BACKGROUND_PRESET_IDS = [
  "blank",
  "geometric-collage",
  "sunset-arches",
  "postcard-frame",
] as const

export type BackgroundPresetId = (typeof BACKGROUND_PRESET_IDS)[number]

export interface BackgroundPreset {
  id: BackgroundPresetId
  name: string
  schema: LayoutSchema
}

type PresetShape = Omit<ShapeElement, "locked" | "opacity" | "stroke" | "strokeWidth"> &
  Partial<Pick<ShapeElement, "opacity" | "stroke" | "strokeWidth">>

const shape = ({
  opacity = 1,
  stroke = "transparent",
  strokeWidth = 0,
  ...element
}: PresetShape): ShapeElement => ({ ...element, locked: true, opacity, stroke, strokeWidth })

// Axis-aligned only, like the presets below: the browser rotates a shape around its top-left
// corner and the PDF export around its bottom-left, so rotated art would not print the way it
// previews. Colour is pushed to the left column, the top-right corner and a bottom band so the
// page keeps two large flat areas for text: the sage column below the art cluster and the cream
// middle of the page.
const geometricCollageLandscape: LayoutSchema = {
  ...emptyLayoutSchema(),
  background: "#fbf3e7",
  elements: [
    shape({
      id: "sage-column",
      type: "rectangle",
      geometry: { x: -3, y: -3, width: 72, height: 154, rotation: 0 },
      fill: "#cddfd7",
    }),
    shape({
      id: "top-art-base",
      type: "rectangle",
      geometry: { x: 8, y: 10, width: 44, height: 32, rotation: 0 },
      fill: "#27485b",
    }),
    shape({
      id: "top-art-yellow-circle",
      type: "circle",
      geometry: { x: 12, y: 15, width: 14, height: 14, rotation: 0 },
      fill: "#f0c66f",
    }),
    shape({
      id: "top-art-red-circle",
      type: "circle",
      geometry: { x: 33, y: 14, width: 18, height: 18, rotation: 0 },
      fill: "#b45f52",
    }),
    shape({
      id: "top-art-green-circle",
      type: "circle",
      geometry: { x: 10, y: 32, width: 22, height: 22, rotation: 0 },
      fill: "#5b927b",
    }),
    shape({
      id: "top-art-cream-square",
      type: "rectangle",
      geometry: { x: 32, y: 36, width: 17, height: 17, rotation: 0 },
      fill: "#f7ead1",
    }),
    shape({
      id: "corner-circle",
      type: "circle",
      geometry: { x: 172, y: -3, width: 41, height: 41, rotation: 0 },
      opacity: 0.62,
      fill: "#d89b73",
    }),
    shape({
      id: "band-deep-teal",
      type: "rectangle",
      geometry: { x: -3, y: 127, width: 72, height: 24, rotation: 0 },
      fill: "#416b61",
    }),
    shape({
      id: "band-red",
      type: "rectangle",
      geometry: { x: 69, y: 127, width: 27, height: 24, rotation: 0 },
      fill: "#b95743",
    }),
    shape({
      id: "band-yellow",
      type: "rectangle",
      geometry: { x: 96, y: 127, width: 40, height: 24, rotation: 0 },
      fill: "#e5b95c",
    }),
    shape({
      id: "band-teal",
      type: "rectangle",
      geometry: { x: 136, y: 127, width: 34, height: 24, rotation: 0 },
      fill: "#5b9b8b",
    }),
    shape({
      id: "band-sand",
      type: "rectangle",
      geometry: { x: 170, y: 127, width: 43, height: 24, rotation: 0 },
      fill: "#d2ccc0",
    }),
    shape({
      id: "band-cream-circle",
      type: "circle",
      geometry: { x: 100, y: 119, width: 16, height: 16, rotation: 0 },
      fill: "#fff4d6",
    }),
  ],
}

// Axis-aligned only: rotated shapes rotate around the top-left corner in the browser and around the
// bottom-left corner in the exported PDF, so a rotation-free composition looks identical everywhere.
const sunsetArchesLandscape: LayoutSchema = {
  ...emptyLayoutSchema(),
  background: "#fdf4e6",
  elements: [
    shape({
      id: "dusk-band",
      type: "rectangle",
      geometry: { x: -3, y: 112, width: 216, height: 39, rotation: 0 },
      fill: "#f0d3ab",
    }),
    shape({
      id: "horizon-rule",
      type: "rectangle",
      geometry: { x: -3, y: 109.4, width: 216, height: 0.8, rotation: 0 },
      opacity: 0.5,
      fill: "#a9713f",
    }),
    shape({
      id: "sun",
      type: "circle",
      geometry: { x: 118, y: 20, width: 52, height: 52, rotation: 0 },
      opacity: 0.9,
      fill: "#f2b95c",
    }),
    shape({
      id: "tall-arch-crown",
      type: "circle",
      geometry: { x: 146, y: 44, width: 48, height: 48, rotation: 0 },
      fill: "#c25f45",
    }),
    shape({
      id: "tall-arch-body",
      type: "rectangle",
      geometry: { x: 146, y: 68, width: 48, height: 46, rotation: 0 },
      fill: "#c25f45",
    }),
    shape({
      id: "short-arch-crown",
      type: "circle",
      geometry: { x: 110, y: 66, width: 32, height: 32, rotation: 0 },
      fill: "#4f7f72",
    }),
    shape({
      id: "short-arch-body",
      type: "rectangle",
      geometry: { x: 110, y: 82, width: 32, height: 32, rotation: 0 },
      fill: "#4f7f72",
    }),
    shape({
      id: "band-dot-red",
      type: "circle",
      geometry: { x: 14, y: 126, width: 8, height: 8, rotation: 0 },
      fill: "#c25f45",
    }),
    shape({
      id: "band-dot-teal",
      type: "circle",
      geometry: { x: 26, y: 126, width: 8, height: 8, rotation: 0 },
      fill: "#4f7f72",
    }),
    shape({
      id: "band-dot-cream",
      type: "circle",
      geometry: { x: 38, y: 126, width: 8, height: 8, rotation: 0 },
      fill: "#fdf4e6",
    }),
  ],
}

// Rules are thin filled rectangles rather than stroked outlines: the PDF renderer paints a shape
// fill of "transparent" as black, so an unfilled frame would only look right in the browser.
const postcardFrameLandscape: LayoutSchema = {
  ...emptyLayoutSchema(),
  background: "#fffaf2",
  elements: [
    shape({
      id: "frame-top",
      type: "rectangle",
      geometry: { x: 7, y: 7, width: 196, height: 0.7, rotation: 0 },
      fill: "#8a7256",
    }),
    shape({
      id: "frame-bottom",
      type: "rectangle",
      geometry: { x: 7, y: 140.3, width: 196, height: 0.7, rotation: 0 },
      fill: "#8a7256",
    }),
    shape({
      id: "frame-left",
      type: "rectangle",
      geometry: { x: 7, y: 7, width: 0.7, height: 134, rotation: 0 },
      fill: "#8a7256",
    }),
    shape({
      id: "frame-right",
      type: "rectangle",
      geometry: { x: 202.3, y: 7, width: 0.7, height: 134, rotation: 0 },
      fill: "#8a7256",
    }),
    shape({
      id: "inner-frame-top",
      type: "rectangle",
      geometry: { x: 10, y: 10, width: 190, height: 0.35, rotation: 0 },
      fill: "#d8c8ae",
    }),
    shape({
      id: "inner-frame-bottom",
      type: "rectangle",
      geometry: { x: 10, y: 137.65, width: 190, height: 0.35, rotation: 0 },
      fill: "#d8c8ae",
    }),
    shape({
      id: "inner-frame-left",
      type: "rectangle",
      geometry: { x: 10, y: 10, width: 0.35, height: 128, rotation: 0 },
      fill: "#d8c8ae",
    }),
    shape({
      id: "inner-frame-right",
      type: "rectangle",
      geometry: { x: 199.65, y: 10, width: 0.35, height: 128, rotation: 0 },
      fill: "#d8c8ae",
    }),
    shape({
      id: "message-divider",
      type: "rectangle",
      geometry: { x: 118, y: 20, width: 0.4, height: 108, rotation: 0 },
      fill: "#d8c8ae",
    }),
    shape({
      id: "stamp-block",
      type: "rectangle",
      geometry: { x: 170, y: 16, width: 26, height: 30, rotation: 0 },
      fill: "#e8d7bc",
    }),
    shape({
      id: "stamp-inner",
      type: "rectangle",
      geometry: { x: 173, y: 19, width: 20, height: 24, rotation: 0 },
      fill: "#c8836a",
    }),
    shape({
      id: "postmark",
      type: "circle",
      geometry: { x: 158, y: 14, width: 22, height: 22, rotation: 0 },
      opacity: 0.6,
      fill: "#7f9d94",
    }),
    shape({
      id: "address-rule-top",
      type: "rectangle",
      geometry: { x: 132, y: 104, width: 56, height: 0.4, rotation: 0 },
      fill: "#d8c8ae",
    }),
    shape({
      id: "address-rule-middle",
      type: "rectangle",
      geometry: { x: 132, y: 114, width: 56, height: 0.4, rotation: 0 },
      fill: "#d8c8ae",
    }),
    shape({
      id: "address-rule-bottom",
      type: "rectangle",
      geometry: { x: 132, y: 124, width: 56, height: 0.4, rotation: 0 },
      fill: "#d8c8ae",
    }),
  ],
}

const geometricCollagePortrait: LayoutSchema = {
  ...emptyLayoutSchema("a5", "portrait"),
  background: "#fbf3e7",
  elements: [
    shape({
      id: "sage-header",
      type: "rectangle",
      geometry: { x: -3, y: -3, width: 154, height: 63, rotation: 0 },
      fill: "#cddfd7",
    }),
    shape({
      id: "top-art-base",
      type: "rectangle",
      geometry: { x: 10, y: 10, width: 42, height: 32, rotation: 0 },
      fill: "#27485b",
    }),
    shape({
      id: "top-art-yellow-circle",
      type: "circle",
      geometry: { x: 14, y: 15, width: 14, height: 14, rotation: 0 },
      fill: "#f0c66f",
    }),
    shape({
      id: "top-art-red-circle",
      type: "circle",
      geometry: { x: 33, y: 13, width: 18, height: 18, rotation: 0 },
      fill: "#b45f52",
    }),
    shape({
      id: "top-art-green-circle",
      type: "circle",
      geometry: { x: 12, y: 31, width: 21, height: 21, rotation: 0 },
      fill: "#5b927b",
    }),
    shape({
      id: "top-art-cream-square",
      type: "rectangle",
      geometry: { x: 33, y: 34, width: 16, height: 16, rotation: 0 },
      fill: "#f7ead1",
    }),
    shape({
      id: "corner-circle",
      type: "circle",
      geometry: { x: 111, y: 20, width: 40, height: 40, rotation: 0 },
      opacity: 0.62,
      fill: "#d89b73",
    }),
    shape({
      id: "footer-deep-teal",
      type: "rectangle",
      geometry: { x: -3, y: 181, width: 41, height: 32, rotation: 0 },
      fill: "#416b61",
    }),
    shape({
      id: "footer-red",
      type: "rectangle",
      geometry: { x: 38, y: 181, width: 23, height: 32, rotation: 0 },
      fill: "#b95743",
    }),
    shape({
      id: "footer-yellow",
      type: "rectangle",
      geometry: { x: 61, y: 181, width: 31, height: 32, rotation: 0 },
      fill: "#e5b95c",
    }),
    shape({
      id: "footer-teal",
      type: "rectangle",
      geometry: { x: 92, y: 181, width: 27, height: 32, rotation: 0 },
      fill: "#5b9b8b",
    }),
    shape({
      id: "footer-sand",
      type: "rectangle",
      geometry: { x: 119, y: 181, width: 32, height: 32, rotation: 0 },
      fill: "#d2ccc0",
    }),
    shape({
      id: "footer-cream-circle",
      type: "circle",
      geometry: { x: 68, y: 173, width: 16, height: 16, rotation: 0 },
      fill: "#fff4d6",
    }),
  ],
}

const sunsetArchesPortrait: LayoutSchema = {
  ...emptyLayoutSchema("a5", "portrait"),
  background: "#fdf4e6",
  elements: [
    shape({
      id: "dusk-band",
      type: "rectangle",
      geometry: { x: -3, y: 154, width: 154, height: 59, rotation: 0 },
      fill: "#f0d3ab",
    }),
    shape({
      id: "horizon-rule",
      type: "rectangle",
      geometry: { x: -3, y: 151.4, width: 154, height: 0.8, rotation: 0 },
      opacity: 0.5,
      fill: "#a9713f",
    }),
    shape({
      id: "sun",
      type: "circle",
      geometry: { x: 79, y: 92, width: 52, height: 52, rotation: 0 },
      opacity: 0.9,
      fill: "#f2b95c",
    }),
    shape({
      id: "tall-arch-crown",
      type: "circle",
      geometry: { x: 96, y: 126, width: 42, height: 42, rotation: 0 },
      fill: "#c25f45",
    }),
    shape({
      id: "tall-arch-body",
      type: "rectangle",
      geometry: { x: 96, y: 147, width: 42, height: 40, rotation: 0 },
      fill: "#c25f45",
    }),
    shape({
      id: "short-arch-crown",
      type: "circle",
      geometry: { x: 61, y: 147, width: 30, height: 30, rotation: 0 },
      fill: "#4f7f72",
    }),
    shape({
      id: "short-arch-body",
      type: "rectangle",
      geometry: { x: 61, y: 162, width: 30, height: 25, rotation: 0 },
      fill: "#4f7f72",
    }),
    shape({
      id: "band-dot-red",
      type: "circle",
      geometry: { x: 13, y: 192, width: 8, height: 8, rotation: 0 },
      fill: "#c25f45",
    }),
    shape({
      id: "band-dot-teal",
      type: "circle",
      geometry: { x: 25, y: 192, width: 8, height: 8, rotation: 0 },
      fill: "#4f7f72",
    }),
    shape({
      id: "band-dot-cream",
      type: "circle",
      geometry: { x: 37, y: 192, width: 8, height: 8, rotation: 0 },
      fill: "#fdf4e6",
    }),
  ],
}

const postcardFramePortrait: LayoutSchema = {
  ...emptyLayoutSchema("a5", "portrait"),
  background: "#fffaf2",
  elements: [
    ...[7, 10].flatMap((inset, index) => {
      const thickness = index === 0 ? 0.7 : 0.35
      const color = index === 0 ? "#8a7256" : "#d8c8ae"
      return [
        shape({
          id: `frame-${index}-top`,
          type: "rectangle",
          geometry: { x: inset, y: inset, width: 148 - inset * 2, height: thickness, rotation: 0 },
          fill: color,
        }),
        shape({
          id: `frame-${index}-bottom`,
          type: "rectangle",
          geometry: {
            x: inset,
            y: 210 - inset - thickness,
            width: 148 - inset * 2,
            height: thickness,
            rotation: 0,
          },
          fill: color,
        }),
        shape({
          id: `frame-${index}-left`,
          type: "rectangle",
          geometry: { x: inset, y: inset, width: thickness, height: 210 - inset * 2, rotation: 0 },
          fill: color,
        }),
        shape({
          id: `frame-${index}-right`,
          type: "rectangle",
          geometry: {
            x: 148 - inset - thickness,
            y: inset,
            width: thickness,
            height: 210 - inset * 2,
            rotation: 0,
          },
          fill: color,
        }),
      ]
    }),
    shape({
      id: "message-divider",
      type: "rectangle",
      geometry: { x: 20, y: 105, width: 108, height: 0.4, rotation: 0 },
      fill: "#d8c8ae",
    }),
    shape({
      id: "stamp-block",
      type: "rectangle",
      geometry: { x: 104, y: 16, width: 26, height: 30, rotation: 0 },
      fill: "#e8d7bc",
    }),
    shape({
      id: "stamp-inner",
      type: "rectangle",
      geometry: { x: 107, y: 19, width: 20, height: 24, rotation: 0 },
      fill: "#c8836a",
    }),
    shape({
      id: "postmark",
      type: "circle",
      geometry: { x: 92, y: 14, width: 22, height: 22, rotation: 0 },
      opacity: 0.6,
      fill: "#7f9d94",
    }),
    ...[156, 168, 180].map((y, index) =>
      shape({
        id: `address-rule-${index}`,
        type: "rectangle",
        geometry: { x: 50, y, width: 68, height: 0.4, rotation: 0 },
        fill: "#d8c8ae",
      })
    ),
  ],
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: "blank",
    get name() {
      return m.ui_blank()
    },
    schema: emptyLayoutSchema(),
  },
  {
    id: "geometric-collage",
    get name() {
      return m.ui_geometric_collage()
    },
    schema: geometricCollageLandscape,
  },
  {
    id: "sunset-arches",
    get name() {
      return m.ui_sunset_arches()
    },
    schema: sunsetArchesLandscape,
  },
  {
    id: "postcard-frame",
    get name() {
      return m.ui_postcard_frame()
    },
    schema: postcardFrameLandscape,
  },
]

export function backgroundPresets(
  format: PageFormat,
  orientation: PageOrientation
): BackgroundPreset[] {
  return BACKGROUND_PRESETS.map((preset) => ({
    ...preset,
    schema: presetSchema(preset.id, format, orientation),
  }))
}

function presetSchema(
  presetId: BackgroundPresetId,
  format: PageFormat,
  orientation: PageOrientation
): LayoutSchema {
  const landscapeSchemas: Record<Exclude<BackgroundPresetId, "blank">, LayoutSchema> = {
    "geometric-collage": geometricCollageLandscape,
    "sunset-arches": sunsetArchesLandscape,
    "postcard-frame": postcardFrameLandscape,
  }
  const portraitSchemas: Record<Exclude<BackgroundPresetId, "blank">, LayoutSchema> = {
    "geometric-collage": geometricCollagePortrait,
    "sunset-arches": sunsetArchesPortrait,
    "postcard-frame": postcardFramePortrait,
  }
  const source =
    presetId === "blank"
      ? emptyLayoutSchema("a5", orientation)
      : orientation === "portrait"
        ? portraitSchemas[presetId]
        : landscapeSchemas[presetId]
  return format === "a5"
    ? source
    : resizeLayoutSchema(source, pageSpecification(format, orientation))
}

export function backgroundSchema(
  presetId: BackgroundPresetId,
  format: PageFormat = "a5",
  orientation: PageOrientation = "landscape"
): LayoutSchema {
  const preset = presetSchema(presetId, format, orientation)
  return {
    ...preset,
    elements: preset.elements.map((element) => ({
      ...element,
      id: crypto.randomUUID(),
      geometry: { ...element.geometry },
    })),
  }
}
