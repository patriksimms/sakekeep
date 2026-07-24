import { type LayoutElement } from "./types.ts"

export type LayerAction = "backward" | "forward" | "back" | "front"

export function moveElementLayer(
  elements: LayoutElement[],
  selectedId: string,
  action: LayerAction
): LayoutElement[] {
  const index = elements.findIndex((element) => element.id === selectedId)
  if (index < 0) return elements

  const targetIndex = {
    backward: index - 1,
    forward: index + 1,
    back: 0,
    front: elements.length - 1,
  }[action]
  const boundedIndex = Math.min(elements.length - 1, Math.max(0, targetIndex))
  if (boundedIndex === index) return elements

  const reordered = [...elements]
  const [moved] = reordered.splice(index, 1)
  reordered.splice(boundedIndex, 0, moved!)
  return reordered
}

export function isEditorDeleteKey(
  event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "defaultPrevented" | "key" | "metaKey">,
  target: EventTarget | null,
  isInlineTextEditing: boolean
): boolean {
  if (
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    (event.key !== "Backspace" && event.key !== "Delete") ||
    isInlineTextEditing
  ) {
    return false
  }

  return !(
    target instanceof Element &&
    target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
  )
}
