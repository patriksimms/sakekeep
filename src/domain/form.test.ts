import { describe, expect, it } from "vitest"

import {
  emptyFormSchema,
  formSchemaValidator,
  groupFormIssues,
  validateFormForDraft,
  validateFormForPublish,
  validateSubmission,
} from "./form.ts"
import { FORM_SCHEMA_VERSION, type FormQuestion, type FormSchema } from "./types.ts"
import { completeForm } from "../test/fixtures.ts"

describe("form validation", () => {
  it("accepts every configured answer type", () => {
    expect(validateFormForPublish(completeForm)).toEqual([])
    expect(
      validateSubmission(
        completeForm,
        {
          name: "Nora",
          website: "https://example.com",
          memory: "Line one\nLine two",
          role: ["friend"],
          traits: ["kind", "funny"],
          photos: [],
        },
        [
          {
            questionId: "photos",
            index: 0,
            name: "memory.heic",
            mimeType: "image/heic",
            sizeBytes: 1024,
          },
        ]
      )
    ).toEqual([])
  })

  it("rejects attempts to bypass the frozen schema", () => {
    const issues = validateSubmission(completeForm, {
      name: "A".repeat(41),
      website: "javascript:alert(1)",
      memory: "",
      role: ["unknown", "friend"],
      traits: [],
      injected: "not in the form",
    })
    expect(issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "answers.injected",
        "answers.name",
        "answers.website",
        "answers.memory",
        "answers.role",
        "answers.traits",
      ])
    )
  })

  it("enforces per-file, aggregate, count, and type limits", () => {
    const uploads = [
      {
        questionId: "photos",
        index: 0,
        name: "malware.exe",
        mimeType: "application/octet-stream",
        sizeBytes: 16 * 1024 * 1024,
      },
      {
        questionId: "photos",
        index: 1,
        name: "second.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 20 * 1024 * 1024,
      },
      {
        questionId: "photos",
        index: 2,
        name: "third.png",
        mimeType: "image/png",
        sizeBytes: 20 * 1024 * 1024,
      },
    ]
    const issues = validateSubmission(
      completeForm,
      {
        name: "Nora",
        memory: "Memory",
        role: ["friend"],
        traits: ["kind"],
      },
      uploads
    )
    expect(issues.some((issue) => issue.message.includes("no more than 2"))).toBe(true)
    expect(issues.some((issue) => issue.message.includes("not a supported"))).toBe(true)
    expect(issues.some((issue) => issue.message.includes("larger than 15 MB"))).toBe(true)
    expect(issues.some((issue) => issue.message.includes("total no more"))).toBe(true)
  })

  it("rejects duplicate IDs and unknown schema versions", () => {
    const invalid = {
      version: FORM_SCHEMA_VERSION,
      questions: [completeForm.questions[0], completeForm.questions[0]],
    }
    expect(formSchemaValidator.safeParse(invalid).success).toBe(false)
    expect(formSchemaValidator.safeParse({ ...completeForm, version: 999 }).success).toBe(false)
  })
})

/** A question as the builder creates it: no prompt yet, because nobody has typed one. */
function draftWith(question: FormQuestion): FormSchema {
  return { version: FORM_SCHEMA_VERSION, questions: [question] }
}

const blankSingleLine: FormQuestion = {
  id: "fresh",
  type: "single-line",
  prompt: "",
  required: false,
  validateUrl: false,
}

describe("draft form validation", () => {
  it("accepts a question that has just been added and not yet filled in", () => {
    expect(validateFormForDraft(draftWith(blankSingleLine))).toEqual([])
    expect(
      validateFormForDraft(
        draftWith({
          id: "fresh-radio",
          type: "radio",
          prompt: "",
          required: false,
          choices: [
            { id: "a", label: "" },
            { id: "b", label: "Option 2" },
          ],
        })
      )
    ).toEqual([])
  })

  it("accepts an empty form and every complete form", () => {
    expect(validateFormForDraft(emptyFormSchema())).toEqual([])
    expect(validateFormForDraft(completeForm)).toEqual([])
  })

  it("still rejects structurally invalid drafts", () => {
    expect(
      validateFormForDraft(draftWith({ ...blankSingleLine, prompt: "x".repeat(501) }))
    ).toEqual([{ path: "questions.0.prompt", message: "Use no more than 500 characters." }])

    expect(
      validateFormForDraft(
        draftWith({
          id: "too-few",
          type: "checkboxes",
          prompt: "Pick",
          required: false,
          choices: [{ id: "only", label: "Only" }],
        })
      )
    ).toEqual([{ path: "questions.0.choices", message: "Offer at least two choices." }])

    expect(
      validateFormForDraft({
        version: FORM_SCHEMA_VERSION,
        questions: [blankSingleLine, blankSingleLine],
      }).map((issue) => issue.path)
    ).toContain("questions.1.id")

    expect(
      validateFormForDraft({ ...completeForm, version: 999 } as unknown as FormSchema)
    ).not.toEqual([])
  })

  it("keeps blank prompts and labels blocking for publish only", () => {
    expect(validateFormForPublish(draftWith(blankSingleLine))).toEqual([
      { path: "questions.0.prompt", message: "Enter a question prompt." },
    ])
    expect(
      validateFormForPublish(
        draftWith({
          id: "labels",
          type: "radio",
          prompt: "Pick",
          required: false,
          choices: [
            { id: "a", label: "  " },
            { id: "b", label: "Option 2" },
          ],
        })
      )
    ).toEqual([{ path: "questions.0.choices.0.label", message: "Enter a choice label." }])
  })
})

describe("groupFormIssues", () => {
  it("routes each issue to the input that caused it", () => {
    const grouped = groupFormIssues([
      { path: "questions.0.prompt", message: "Enter a question prompt." },
      { path: "questions.0.prompt", message: "Use no more than 500 characters." },
      { path: "questions.1.choices.2.label", message: "Enter a choice label." },
      { path: "questions.1.choices.2.id", message: "Choice IDs must be unique within a question." },
      { path: "questions.1.id", message: "Question IDs must be unique." },
      { path: "questions.1.choices", message: "Offer at least two choices." },
    ])

    expect(grouped.form).toEqual([])
    expect(grouped.byQuestion.get(0)!.prompt).toEqual([
      "Enter a question prompt.",
      "Use no more than 500 characters.",
    ])
    // Every issue addressing a specific choice lands on that choice, whichever leaf it names.
    expect(grouped.byQuestion.get(1)!.choices.get(2)).toEqual([
      "Enter a choice label.",
      "Choice IDs must be unique within a question.",
    ])
    // Issues about the question or the choice list as a whole have no single input to sit on.
    expect(grouped.byQuestion.get(1)!.other).toEqual([
      "Question IDs must be unique.",
      "Offer at least two choices.",
    ])
  })

  it("resolves route-level paths rooted at the request body to the same question", () => {
    const grouped = groupFormIssues([
      { path: "formSchema.questions.0.prompt", message: "Use no more than 500 characters." },
      { path: "formSchema.questions.0.choices.1.label", message: "Enter a choice label." },
    ])

    expect(grouped.form).toEqual([])
    expect(grouped.byQuestion.get(0)!.prompt).toEqual(["Use no more than 500 characters."])
    expect(grouped.byQuestion.get(0)!.choices.get(1)).toEqual(["Enter a choice label."])
  })

  it("falls back to the form level for issues that name no question", () => {
    const grouped = groupFormIssues([
      { path: "questions", message: "Add at least one valid question before publishing." },
      { path: "version", message: "Invalid input." },
      { path: "", message: "Invalid input." },
    ])

    expect(grouped.byQuestion.size).toBe(0)
    expect(grouped.form).toEqual([
      "Add at least one valid question before publishing.",
      "Invalid input.",
      "Invalid input.",
    ])
  })
})
