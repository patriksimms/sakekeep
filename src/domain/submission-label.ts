import * as m from "#/paraglide/messages.js"
import { type FormSchema, type SubmissionSummary } from "./types.ts"

function normalizeFieldName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]/g, "")
}

function normalizedFieldWords(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase("en")
    .match(/[a-z0-9]+/g)
}

export function submissionLabel(form: FormSchema, submission: SubmissionSummary) {
  for (const question of form.questions) {
    const isNameField =
      normalizeFieldName(question.id) === "name" ||
      normalizedFieldWords(question.prompt)?.includes("name")
    if (!isNameField) continue

    const answer = submission.answers[question.id]
    if (typeof answer === "string" && answer.trim()) return answer.trim()
  }
  return m.response_label({ value0: submission.sequence })
}
