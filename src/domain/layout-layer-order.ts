import { type LayoutElement } from "./types.ts"

export type DropEdge = "before" | "after"

export function reorderElementsFromTopmostList(
  elements: LayoutElement[],
  draggedId: string,
  targetId: string,
  edge: DropEdge
): LayoutElement[] {
  if (draggedId === targetId) return elements

  const displayed = [...elements].reverse()
  const draggedIndex = displayed.findIndex((element) => element.id === draggedId)
  const targetIndex = displayed.findIndex((element) => element.id === targetId)
  if (draggedIndex < 0 || targetIndex < 0) return elements

  const [dragged] = displayed.splice(draggedIndex, 1)
  const remainingTargetIndex = displayed.findIndex((element) => element.id === targetId)
  const insertionIndex = remainingTargetIndex + (edge === "after" ? 1 : 0)
  displayed.splice(insertionIndex, 0, dragged!)

  const reordered = displayed.reverse()
  return reordered.every((element, index) => element === elements[index]) ? elements : reordered
}
