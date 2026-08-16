import type { BoundTextElement, FormQuestion } from "./types.ts"

export function boundTextLabel(
  element: BoundTextElement,
  question: FormQuestion | undefined
): string {
  if (!element.showLabel) return ""
  return element.label?.trim() || question?.prompt || "Question"
}
