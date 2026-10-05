import writeExcelFile, { type Row } from "write-excel-file/node"

import type { FormQuestion, Project, SubmissionAnswer } from "#/domain/types.ts"
import * as m from "#/paraglide/messages.js"

function answerText(question: FormQuestion, answer: SubmissionAnswer | undefined, origin: string) {
  if (answer === undefined) return ""
  if (typeof answer === "string") return answer
  if (question.type === "radio" || question.type === "checkboxes") {
    const labels = new Map(question.choices.map((choice) => [choice.id, choice.label]))
    return answer
      .filter((item) => typeof item === "string")
      .map((id) => labels.get(id) ?? id)
      .join("\n")
  }
  return answer
    .filter((item) => typeof item !== "string")
    .map(
      (image) => `${image.name}\n${new URL(`/api/assets/${image.assetId}?variant=master`, origin)}`
    )
    .join("\n\n")
}

/** Export saved answers as text cells so contributor input can never become an Excel formula. */
export async function responseWorkbook(
  project: Pick<Project, "formSchema" | "submissions">,
  origin: string
) {
  const questions = project.formSchema.questions
  const headers = [
    m.response_export_number(),
    m.response_export_submitted_at(),
    ...questions.map((q) => q.prompt),
  ]
  const rows: Row[] = [headers.map((value) => ({ value, type: String, fontWeight: "bold" }))]
  for (const submission of project.submissions ?? []) {
    rows.push([
      { value: submission.sequence, type: Number },
      { value: submission.submittedAt, type: String },
      ...questions.map((question) => ({
        value: answerText(question, submission.answers[question.id], origin),
        type: String,
        wrap: true,
      })),
    ])
  }
  return writeExcelFile(rows, {
    sheet: m.ui_responses(),
    stickyRowsCount: 1,
    columns: [{ width: 12 }, { width: 28 }, ...questions.map(() => ({ width: 40 }))],
  }).toBuffer()
}
