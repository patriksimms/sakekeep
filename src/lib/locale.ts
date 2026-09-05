import { z } from "zod"

export const localeSchema = z.enum(["de", "en"])
export type Locale = z.infer<typeof localeSchema>
export function isLocale(value: unknown): value is Locale {
  return value === "de" || value === "en"
}
