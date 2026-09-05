import * as m from "#/paraglide/messages.js"
import { type FormQuestion, type LayoutElement } from "./types.ts"

export interface LayoutQuestionAction {
  elementType: Extract<LayoutElement["type"], "bound-text" | "image-frame" | "gallery-frame">
  label: string
}

export interface LayoutQuestionPaletteItem {
  questionId: string
  prompt: string
  actions: LayoutQuestionAction[]
}

export function questionPrompt(question: Pick<FormQuestion, "prompt"> | undefined): string {
  return question?.prompt.trim() || m.ui_untitled_question()
}

export function boundQuestionPlaceholder(
  questions: Array<Pick<FormQuestion, "id" | "prompt">>,
  questionId: string
): string {
  return `{{ ${questionPrompt(questions.find((question) => question.id === questionId))} }}`
}

export function boundQuestionLabel(
  questions: Array<Pick<FormQuestion, "id" | "prompt">>,
  questionId: string
): string {
  const question = questions.find((candidate) => candidate.id === questionId)
  return question ? questionPrompt(question) : m.ui_unbound_element()
}

export function layoutQuestionPalette(
  questions: Array<Pick<FormQuestion, "id" | "prompt" | "type">>
): LayoutQuestionPaletteItem[] {
  return questions.map((question) => ({
    questionId: question.id,
    prompt: questionPrompt(question),
    actions:
      question.type === "images"
        ? [
            { elementType: "image-frame", label: m.ui_image_399() },
            { elementType: "gallery-frame", label: m.ui_gallery() },
          ]
        : [{ elementType: "bound-text", label: m.ui_text() }],
  }))
}
