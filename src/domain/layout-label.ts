import { type Locale } from "#/lib/locale.ts"
import * as m from "#/paraglide/messages.js"
import type { BoundTextElement, FormQuestion } from "./types.ts"

export function boundTextLabel(
  element: BoundTextElement,
  question: FormQuestion | undefined,
  locale: Locale = "en"
): string {
  if (!element.showLabel) return ""
  return element.label?.trim() || question?.prompt || m.question({}, { locale })
}
