import * as m from "#/paraglide/messages.js"
import { type BookStatus, type ProjectState, type PageOrientation } from "./types.ts"

export function projectStateLabel(state: ProjectState) {
  return state === "draft"
    ? m.ui_draft()
    : state === "collecting"
      ? m.ui_collecting()
      : m.ui_closed()
}

export function bookStatusLabel(status: BookStatus) {
  return status === "not-generated"
    ? m.book_not_generated()
    : status === "stale"
      ? m.book_stale()
      : m.book_current()
}

export function orientationLabel(orientation: PageOrientation) {
  return orientation === "portrait" ? m.orientation_portrait() : m.orientation_landscape()
}
