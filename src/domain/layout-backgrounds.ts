import { emptyLayoutSchema } from "./layout.ts"
import { type LayoutSchema } from "./types.ts"

export const BACKGROUND_PRESET_IDS = ["blank", "warm-quote", "playful-note"] as const

export type BackgroundPresetId = (typeof BACKGROUND_PRESET_IDS)[number]

export interface BackgroundPreset {
  id: BackgroundPresetId
  name: string
  schema: LayoutSchema
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: "blank",
    name: "Blank",
    schema: emptyLayoutSchema(),
  },
  {
    id: "warm-quote",
    name: "Warm quote",
    schema: {
      ...emptyLayoutSchema(),
      background: "#fff9ef",
      elements: [
        {
          id: "warm-panel",
          type: "rectangle",
          geometry: { x: -3, y: -3, width: 78, height: 154, rotation: 0 },
          opacity: 1,
          locked: true,
          fill: "#dfe8d8",
          stroke: "#dfe8d8",
          strokeWidth: 0,
        },
      ],
    },
  },
  {
    id: "playful-note",
    name: "Playful note",
    schema: {
      ...emptyLayoutSchema(),
      background: "#f4eee9",
      elements: [
        {
          id: "play-circle",
          type: "circle",
          geometry: { x: 123, y: -3, width: 90, height: 72, rotation: 0 },
          opacity: 1,
          locked: true,
          fill: "#ead6bf",
          stroke: "#ead6bf",
          strokeWidth: 0,
        },
      ],
    },
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
