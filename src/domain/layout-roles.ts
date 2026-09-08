import * as m from "#/paraglide/messages.js"
import { type LayoutElement, type LayoutRecord, type LayoutRole } from "./types.ts"

export const LAYOUT_ROLES = [
  "submission",
  "front-cover",
  "back-cover",
  "static",
] as const satisfies readonly LayoutRole[]

/** Roles a project can hold at most once, because the book has exactly one of each side. */
export const COVER_ROLES = ["front-cover", "back-cover"] as const satisfies readonly LayoutRole[]

export type CoverRole = (typeof COVER_ROLES)[number]

export function isCoverRole(role: LayoutRole): role is CoverRole {
  return role === "front-cover" || role === "back-cover"
}

/** Every role except `submission` backs a page that exists without a response behind it. */
export function isStandaloneRole(role: LayoutRole): boolean {
  return role !== "submission"
}

export function layoutRoleLabel(role: LayoutRole): string {
  switch (role) {
    case "submission":
      return m.ui_response_layout()
    case "front-cover":
      return m.ui_front_cover()
    case "back-cover":
      return m.ui_back_cover()
    case "static":
      return m.ui_standalone_page()
  }
}

const RESPONSE_BOUND_ELEMENT_TYPES = [
  "bound-text",
  "image-frame",
  "gallery-frame",
] as const satisfies readonly LayoutElement["type"][]

export function isResponseBoundElement(type: LayoutElement["type"]): boolean {
  return (RESPONSE_BOUND_ELEMENT_TYPES as readonly string[]).includes(type)
}

/**
 * Only response layouts may carry elements that read from a submission. A cover or standalone
 * page has no response behind it, so a bound element there would always render empty.
 */
export function allowsResponseBoundElements(role: LayoutRole): boolean {
  return role === "submission"
}

export function findLayoutByRole<T extends { role: LayoutRole }>(
  layouts: T[],
  role: CoverRole
): T | undefined {
  return layouts.find((layout) => layout.role === role)
}

export function responseLayouts<T extends { role: LayoutRole }>(layouts: T[]): T[] {
  return layouts.filter((layout) => layout.role === "submission")
}

/**
 * Presentation order for the layout switcher and the book: the front cover always first, the
 * back cover always last, everything else in stored position order.
 */
export function orderedLayouts<T extends { role: LayoutRole; position: number }>(
  layouts: T[]
): T[] {
  const byPosition = [...layouts].sort((left, right) => left.position - right.position)
  return [
    ...byPosition.filter((layout) => layout.role === "front-cover"),
    ...byPosition.filter((layout) => !isCoverRole(layout.role)),
    ...byPosition.filter((layout) => layout.role === "back-cover"),
  ]
}

/** The layouts a reorder action may move, in their current order. */
export function reorderableLayouts(layouts: LayoutRecord[]): LayoutRecord[] {
  return orderedLayouts(layouts).filter((layout) => !isCoverRole(layout.role))
}

export function defaultLayoutName(role: LayoutRole, existingCount: number): string {
  return role === "submission"
    ? m.layout_number({ value0: existingCount + 1 })
    : layoutRoleLabel(role)
}
