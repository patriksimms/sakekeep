import { emptyLayoutSchema } from "./layout.ts"
import { type LayoutSchema, type ShapeElement } from "./types.ts"

export const BACKGROUND_PRESET_IDS = ["blank", "geometric-collage"] as const

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

const geometricCollage: LayoutSchema = {
  ...emptyLayoutSchema(),
  background: "#fbf3e7",
  elements: [
    shape({
      id: "sage-panel",
      type: "rectangle",
      geometry: { x: -3, y: -3, width: 57, height: 154, rotation: 0 },
      fill: "#cddfd7",
      stroke: "#416b61",
      strokeWidth: 0.8,
    }),
    shape({
      id: "top-art-base",
      type: "rectangle",
      geometry: { x: 4, y: 7, width: 43, height: 34, rotation: -6 },
      fill: "#27485b",
    }),
    shape({
      id: "top-art-yellow-circle",
      type: "circle",
      geometry: { x: 7, y: 8, width: 14, height: 14, rotation: -6 },
      fill: "#f0c66f",
    }),
    shape({
      id: "top-art-red-circle",
      type: "circle",
      geometry: { x: 31, y: 4, width: 20, height: 20, rotation: -6 },
      fill: "#b45f52",
    }),
    shape({
      id: "top-art-green-circle",
      type: "circle",
      geometry: { x: 7, y: 28, width: 22, height: 22, rotation: -6 },
      fill: "#5b927b",
    }),
    shape({
      id: "top-art-cream-diamond",
      type: "rectangle",
      geometry: { x: 27, y: 28, width: 14, height: 14, rotation: 39 },
      fill: "#f7ead1",
    }),
    shape({
      id: "overlap-circle",
      type: "circle",
      geometry: { x: 160, y: -8, width: 54, height: 54, rotation: 0 },
      opacity: 0.62,
      fill: "#d89b73",
      stroke: "#7e4932",
      strokeWidth: 1.2,
    }),
    shape({
      id: "left-yellow-layer",
      type: "rectangle",
      geometry: { x: 5, y: 55, width: 60, height: 76, rotation: 3 },
      fill: "#e5b95c",
    }),
    shape({
      id: "left-teal-layer",
      type: "rectangle",
      geometry: { x: 7, y: 55, width: 52, height: 76, rotation: 3 },
      fill: "#5b9b8b",
    }),
    shape({
      id: "left-blue-layer",
      type: "rectangle",
      geometry: { x: 44, y: 57, width: 24, height: 76, rotation: 3 },
      fill: "#526f9f",
    }),
    shape({
      id: "left-cream-circle",
      type: "circle",
      geometry: { x: 55, y: 62, width: 18, height: 18, rotation: 3 },
      fill: "#fff4d6",
    }),
    shape({
      id: "lower-red-panel",
      type: "rectangle",
      geometry: { x: 80, y: 76, width: 22, height: 61, rotation: -2 },
      fill: "#b95743",
    }),
    shape({
      id: "lower-yellow-panel",
      type: "rectangle",
      geometry: { x: 101, y: 76, width: 30, height: 61, rotation: -2 },
      fill: "#e5b95c",
    }),
    shape({
      id: "lower-teal-panel",
      type: "rectangle",
      geometry: { x: 130, y: 76, width: 30, height: 61, rotation: -2 },
      fill: "#5b9b8b",
    }),
    shape({
      id: "lower-cream-diamond",
      type: "rectangle",
      geometry: { x: 87, y: 112, width: 16, height: 16, rotation: 43 },
      fill: "#f7e6d2",
    }),
    shape({
      id: "right-yellow-panel",
      type: "rectangle",
      geometry: { x: 164, y: 75, width: 38, height: 22, rotation: -2 },
      fill: "#e5b95c",
    }),
    shape({
      id: "right-green-panel",
      type: "rectangle",
      geometry: { x: 164, y: 96, width: 38, height: 10, rotation: -2 },
      fill: "#5b9b8b",
    }),
    shape({
      id: "right-cream-circle",
      type: "circle",
      geometry: { x: 168, y: 97, width: 12, height: 12, rotation: -2 },
      fill: "#fff4d6",
    }),
    shape({
      id: "right-gray-panel",
      type: "rectangle",
      geometry: { x: 164, y: 108, width: 38, height: 29, rotation: -2 },
      fill: "#d2ccc0",
    }),
    shape({
      id: "diagonal-line",
      type: "line",
      geometry: { x: 54, y: 137, width: 150, height: 8, rotation: 1 },
      opacity: 0.78,
      fill: "transparent",
      stroke: "#76564b",
      strokeWidth: 1.1,
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
