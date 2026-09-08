import { useRouteContext } from "@tanstack/react-router"
import { getLocale } from "#/paraglide/runtime.js"

/** The share-link shell follows the book; organizer preferences remain in their cookie. */
export function useReaderLocale() {
  return useRouteContext({ from: "__root__" }).readerLocale ?? getLocale()
}
