import { z } from "zod"
import { FILLER_MOTIFS, fillerMotif, fillerSeed } from "./filler-art.ts"
import { frameSlotCount } from "./photo-assignment.ts"
import type { LayoutElement, LayoutSchema } from "./types.ts"

export const emptySlotChoiceSchema = z.union([
  z.literal("blank"),
  z.enum(FILLER_MOTIFS.map((motif) => motif.id)),
])
export type EmptySlotChoice = z.infer<typeof emptySlotChoiceSchema>
export const emptySlotArtSchema = z.record(
  z.string().min(1).max(100),
  z.record(z.string().regex(/^[0-3]$/), emptySlotChoiceSchema)
)
export type EmptySlotArt = z.infer<typeof emptySlotArtSchema>
type PhotoFrame = Extract<LayoutElement, { type: "image-frame" | "gallery-frame" }>

/** Both renderers resolve the page override before the layout default. */
export function resolveEmptySlotArt(
  element: PhotoFrame,
  pageSeed: string,
  slotIndex: number,
  overrides?: EmptySlotArt
) {
  const choice = overrides?.[element.id]?.[slotIndex]
  if (choice === "blank") return undefined
  if (choice !== undefined) return FILLER_MOTIFS.find((motif) => motif.id === choice)
  return element.fillEmptySlots !== false
    ? fillerMotif(fillerSeed(pageSeed, element.id), slotIndex)
    : undefined
}

/** A removed slot must not regain its old choice if it is added again later. */
export function retainEmptySlotArt(overrides: EmptySlotArt | undefined, schema: LayoutSchema) {
  if (!overrides) return undefined
  const retained: EmptySlotArt = {}
  for (const element of schema.elements) {
    if (element.type !== "image-frame" && element.type !== "gallery-frame") continue
    const choices = overrides[element.id]
    if (!choices) continue
    const count = frameSlotCount(element)
    const slots = Object.fromEntries(
      Object.entries(choices).filter(([index]) => Number(index) < count)
    )
    if (Object.keys(slots).length) retained[element.id] = slots
  }
  return Object.keys(retained).length ? retained : undefined
}
