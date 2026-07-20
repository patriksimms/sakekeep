import { describe, expect, it } from "vitest"

import { formSchemaValidator, validateFormForPublish, validateSubmission } from "./form.ts"
import { FORM_SCHEMA_VERSION } from "./types.ts"
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
