import {
  FORM_SCHEMA_VERSION,
  type FormSchema,
  type GenerationSettings,
  type LayoutRecord,
  type SubmissionSummary,
} from "#/domain/types.ts"
import { addElement, emptyLayoutSchema } from "#/domain/layout.ts"

export const completeForm: FormSchema = {
  version: FORM_SCHEMA_VERSION,
  questions: [
    {
      id: "name",
      type: "single-line",
      prompt: "Your name",
      required: true,
      characterLimit: 40,
    },
    {
      id: "website",
      type: "single-line",
      prompt: "Website",
      required: false,
      validateUrl: true,
    },
    {
      id: "memory",
      type: "multiline",
      prompt: "A memory",
      required: true,
      characterLimit: 500,
    },
    {
      id: "role",
      type: "radio",
      prompt: "How do you know us?",
      required: true,
      choices: [
        { id: "friend", label: "Friend" },
        { id: "family", label: "Family" },
      ],
    },
    {
      id: "traits",
      type: "checkboxes",
      prompt: "Choose traits",
      required: true,
      choices: [
        { id: "kind", label: "Kind" },
        { id: "funny", label: "Funny" },
      ],
    },
    {
      id: "photos",
      type: "images",
      prompt: "Photos",
      required: false,
      maxImages: 2,
    },
  ],
}

export function layoutFixture(
  id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  position = 0
): LayoutRecord {
  let schema = addElement(emptyLayoutSchema(), "bound-text", "memory")
  schema = addElement(schema, "image-frame", "photos")
  return {
    id,
    projectId: "99999999-9999-4999-8999-999999999999",
    name: `Layout ${position + 1}`,
    position,
    revision: 0,
    schema,
    updatedAt: "2026-07-18T00:00:00.000Z",
  }
}

export function submissionFixture(id: string, sequence: number): SubmissionSummary {
  return {
    id,
    sequence,
    answers: {
      name: `Person ${sequence}`,
      memory: "A sufficiently short memory.",
      role: ["friend"],
      traits: ["kind"],
      photos: [],
    },
    submittedAt: "2026-07-18T00:00:00.000Z",
  }
}

export const cycleSettings: GenerationSettings = {
  mode: "cycle",
  seed: "sakekeep-test-seed",
  manualAssignments: {},
  resolutionOverrides: [],
}
