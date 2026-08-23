import { describe, expect, it } from "vitest"

import { FORM_SCHEMA_VERSION, type FormSchema } from "./types.ts"
import { submissionLabel } from "./submission-label.ts"

function submission(answers: Record<string, string | string[]> = {}) {
  return {
    id: "submission-id",
    sequence: 3,
    submittedAt: "2026-08-23T12:00:00.000Z",
    answers,
  }
}

function form(id: string, prompt: string): FormSchema {
  return {
    version: FORM_SCHEMA_VERSION,
    questions: [{ id, prompt, type: "single-line", required: false }],
  }
}

describe("submissionLabel", () => {
  it("uses a trimmed answer when the normalized field name is name", () => {
    expect(
      submissionLabel(form(" Ná-me ", "Contributor"), submission({ " Ná-me ": "  Jo  " }))
    ).toBe("Jo")
  })

  it("uses the answer when the normalized field label is name", () => {
    expect(
      submissionLabel(form("question-id", " NAME: "), submission({ "question-id": "Sam" }))
    ).toBe("Sam")
  })

  it.each([
    [form("question-id", "Contributor"), { "question-id": "Jo" }],
    [form("name", "Contributor"), { name: "   " }],
    [form("name", "Contributor"), { name: ["Jo"] }],
  ])("falls back to the response sequence without a usable name", (schema, answers) => {
    expect(submissionLabel(schema, submission(answers))).toBe("Response 3")
  })
})
