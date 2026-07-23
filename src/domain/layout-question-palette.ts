import { type FormQuestion, type LayoutElement } from "./types.ts"

export interface LayoutQuestionAction {
  elementType: Extract<LayoutElement["type"], "bound-text" | "image-frame" | "gallery-frame">
  label: "Text" | "Image" | "Gallery"
}

export interface LayoutQuestionPaletteItem {
  questionId: string
  prompt: string
  actions: LayoutQuestionAction[]
}

export function questionPrompt(question: Pick<FormQuestion, "prompt"> | undefined): string {
  return question?.prompt.trim() || "Untitled question"
}

export function boundQuestionPlaceholder(
  questions: Array<Pick<FormQuestion, "id" | "prompt">>,
  questionId: string
): string {
  return `{{ ${questionPrompt(questions.find((question) => question.id === questionId))} }}`
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
            { elementType: "image-frame", label: "Image" },
            { elementType: "gallery-frame", label: "Gallery" },
          ]
        : [{ elementType: "bound-text", label: "Text" }],
  }))
}
