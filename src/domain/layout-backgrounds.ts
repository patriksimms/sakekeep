import { emptyLayoutSchema } from "./layout.ts"
import { type LayoutSchema, type ShapeElement } from "./types.ts"

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
const geometricCollage: LayoutSchema = {
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
const sunsetArches: LayoutSchema = {
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
const postcardFrame: LayoutSchema = {
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

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: "blank",
    name: "Blank",
    schema: emptyLayoutSchema(),
  },
  {
    id: "geometric-collage",
    name: "Geometric collage",
    schema: geometricCollage,
  },
  {
    id: "sunset-arches",
    name: "Sunset arches",
    schema: sunsetArches,
  },
  {
    id: "postcard-frame",
    name: "Postcard frame",
    schema: postcardFrame,
  },
]

export function backgroundSchema(presetId: BackgroundPresetId): LayoutSchema {
  const preset = BACKGROUND_PRESETS.find(({ id }) => id === presetId)!
  return {
    ...preset.schema,
    elements: preset.schema.elements.map((element) => ({
      ...element,
      id: crypto.randomUUID(),
      geometry: { ...element.geometry },
    })),
  }
}
