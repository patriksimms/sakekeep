import { type FormSchema, type SubmissionSummary } from "./types.ts"

function normalizeFieldName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]/g, "")
}

export function submissionLabel(form: FormSchema, submission: SubmissionSummary) {
  const nameQuestion = form.questions.find(
    (question) =>
      normalizeFieldName(question.id) === "name" || normalizeFieldName(question.prompt) === "name"
  )
  const answer = nameQuestion ? submission.answers[nameQuestion.id] : undefined

  if (typeof answer === "string" && answer.trim()) return answer.trim()
  return `Response ${submission.sequence}`
}
