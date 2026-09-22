import { useState } from "react"
import * as m from "#/paraglide/messages.js"
import { FILLER_MOTIFS, type FillerPalette } from "#/domain/filler-art.ts"
import {
  resolveEmptySlotArt,
  type EmptySlotArt,
  type EmptySlotChoice,
} from "#/domain/empty-slot-art.ts"
import type { LayoutElement } from "#/domain/types.ts"
import { FillerArt } from "./filler-art.tsx"
import { Button } from "./ui/button.tsx"
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "./ui/popover.tsx"

export interface EmptyArtControls {
  onChange: (elementId: string, slotIndex: number, choice: EmptySlotChoice | undefined) => void
}

export function EmptyArtSlot({
  element,
  pageSeed,
  slotIndex,
  palette,
  overrides,
  controls,
}: {
  element: Extract<LayoutElement, { type: "image-frame" | "gallery-frame" }>
  pageSeed: string
  slotIndex: number
  palette: FillerPalette
  overrides?: EmptySlotArt
  controls?: EmptyArtControls
}) {
  const [open, setOpen] = useState(false)
  const motif = resolveEmptySlotArt(element, pageSeed, slotIndex, overrides)
  const art = motif ? <FillerArt motif={motif} palette={palette} /> : null
  if (!controls) return art
  const choice = overrides?.[element.id]?.[slotIndex]
  const choose = (next: EmptySlotChoice | undefined) => {
    setOpen(false)
    controls.onChange(element.id, slotIndex, next)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={m.choose_empty_slot_art({ slot: slotIndex + 1 })}
        style={{ outlineColor: palette.ink }}
        data-empty-art-slot={`${element.id}:${slotIndex}`}
        className="pointer-events-auto block size-full cursor-pointer border-0 bg-transparent p-0 outline-1 -outline-offset-1 outline-dashed focus-visible:outline-2 focus-visible:outline-ring"
      >
        {art}
      </PopoverTrigger>
      <PopoverContent className="w-64" aria-label={m.empty_slot_art()}>
        <PopoverTitle>{m.empty_slot_art()}</PopoverTitle>
        <div className="grid grid-cols-3 gap-1">
          {FILLER_MOTIFS.map((item, index) => (
            <Button
              key={item.id}
              variant={choice === item.id ? "secondary" : "ghost"}
              className="h-16 w-full p-1"
              aria-label={m.artwork_option({ number: index + 1 })}
              aria-pressed={choice === item.id}
              onClick={() => choose(item.id)}
            >
              <FillerArt motif={item} palette={palette} />
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={choice === "blank"}
          onClick={() => choose("blank")}
        >
          {m.blank_slot()}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={choice === undefined}
          onClick={() => choose(undefined)}
        >
          {m.use_layout_default()}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
