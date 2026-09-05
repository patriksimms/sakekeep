import { getLocale } from "#/paraglide/runtime.js"
import { type Locale } from "#/lib/locale.ts"
import * as m from "#/paraglide/messages.js"
import { z } from "zod"

import {
  FORM_SCHEMA_VERSION,
  type FormQuestion,
  type FormSchema,
  type ImageAnswer,
  type SubmissionAnswer,
  type SubmissionAnswers,
} from "./types"

const PROMPT_MAX = 500
const CHOICE_LABEL_MAX = 250

const idSchema = z.string().min(1).max(100)

/**
 * A question is only *finished* once it carries a prompt, but the builder autosaves every
 * keystroke, so a question is born blank and stays blank until the organizer types. Draft
 * autosave therefore validates shape only; the `requireText` variant adds the non-empty rules
 * that gate publishing. See {@link draftFormSchemaValidator} and {@link formSchemaValidator}.
 */
function buildFormValidator(requireText: boolean) {
  const promptSchema = requireText
    ? z
        .string()
        .trim()
        .min(1, { error: () => m.ui_enter_a_question_prompt() })
        .max(PROMPT_MAX, { error: () => m.prompt_character_limit({ value0: PROMPT_MAX }) })
    : z
        .string()
        .trim()
        .max(PROMPT_MAX, { error: () => m.prompt_character_limit({ value0: PROMPT_MAX }) })

  const choiceLabelSchema = requireText
    ? z
        .string()
        .trim()
        .min(1, { error: () => m.ui_enter_a_choice_label() })
        .max(CHOICE_LABEL_MAX, {
          error: () => m.choice_character_limit({ value0: CHOICE_LABEL_MAX }),
        })
    : z
        .string()
        .trim()
        .max(CHOICE_LABEL_MAX, {
          error: () => m.choice_character_limit({ value0: CHOICE_LABEL_MAX }),
        })

  const baseQuestion = z.object({
    id: idSchema,
    prompt: promptSchema,
    required: z.boolean(),
  })

  const singleLineQuestion = baseQuestion.extend({
    type: z.literal("single-line"),
    characterLimit: z.number().int().positive().max(100_000).optional(),
    validateUrl: z.boolean().optional(),
  })

  const multilineQuestion = baseQuestion.extend({
    type: z.literal("multiline"),
    characterLimit: z.number().int().positive().max(100_000).optional(),
  })

  const choiceQuestion = baseQuestion.extend({
    type: z.union([z.literal("radio"), z.literal("checkboxes")]),
    choices: z
      .array(
        z.object({
          id: idSchema,
          label: choiceLabelSchema,
        })
      )
      .min(2, { error: () => m.ui_offer_at_least_two_choices() })
      .max(50, { error: () => m.ui_offer_no_more_than_50_choices() }),
  })

  const imageQuestion = baseQuestion.extend({
    type: z.literal("images"),
    maxImages: z.number().int().min(1).max(10),
  })

  const questionSchema = z.union([
    singleLineQuestion,
    multilineQuestion,
    choiceQuestion,
    imageQuestion,
  ])

  return z
    .object({
      version: z.literal(FORM_SCHEMA_VERSION),
      questions: z.array(questionSchema).max(100),
    })
    .superRefine((form, context) => {
      const questionIds = new Set<string>()
      for (const [questionIndex, question] of form.questions.entries()) {
        if (questionIds.has(question.id)) {
          context.addIssue({
            code: "custom",
            path: ["questions", questionIndex, "id"],
            message: m.ui_question_ids_must_be_unique(),
          })
        }
        questionIds.add(question.id)
        if ("choices" in question) {
          const choiceIds = new Set<string>()
          for (const [choiceIndex, choice] of question.choices.entries()) {
            if (choiceIds.has(choice.id)) {
              context.addIssue({
                code: "custom",
                path: ["questions", questionIndex, "choices", choiceIndex, "id"],
                message: m.ui_choice_ids_must_be_unique_within_a_question(),
              })
            }
            choiceIds.add(choice.id)
          }
        }
      }
    })
}

export const formSchemaValidator = buildFormValidator(true)

/** Structural rules only: an unfinished question is a valid draft, not a rejected save. */
export const draftFormSchemaValidator = buildFormValidator(false)

export interface ValidationIssue {
  path: string
  message: string
}

export interface UploadedImageDescriptor {
  questionId: string
  index: number
  name: string
  mimeType: string
  sizeBytes: number
}

export const acceptedImageMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heif",
  "image/heic",
])

export const acceptedImageExtensions = new Set(["jpg", "jpeg", "png", "webp", "heif", "heic"])

function toIssues(result: z.ZodSafeParseResult<unknown>): ValidationIssue[] {
  if (result.success) return []
  return result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }))
}

export function validateFormForPublish(form: FormSchema): ValidationIssue[] {
  const issues = toIssues(formSchemaValidator.safeParse(form))

  if (form.questions.length === 0) {
    issues.push({
      path: "questions",
      message: m.ui_add_at_least_one_valid_question_before_publishing(),
    })
  }

  return issues
}

/**
 * The rules an autosaved draft must satisfy. Deliberately narrower than
 * {@link validateFormForPublish}: an empty prompt or choice label is work in progress, not a
 * reason to reject the save.
 */
export function validateFormForDraft(form: FormSchema): ValidationIssue[] {
  return toIssues(draftFormSchemaValidator.safeParse(form))
}

export interface QuestionIssues {
  prompt: string[]
  choices: Map<number, string[]>
  other: string[]
}

export interface GroupedFormIssues {
  byQuestion: Map<number, QuestionIssues>
  form: string[]
}

/**
 * Turn flat `questions.0.choices.1.label`-style paths into a per-question lookup the builder can
 * render next to the input that caused each issue. Anything that does not address a specific
 * question falls back to the form-level list.
 *
 * Issues rejected by the API route are addressed against the request body and so arrive one level
 * deeper, as `formSchema.questions.…`; both roots must resolve to the same question.
 */
export function questionIndexForIssue(issue: ValidationIssue): number | null {
  const path = issue.path.startsWith("formSchema.")
    ? issue.path.slice("formSchema.".length)
    : issue.path
  const [root, rawIndex] = path.split(".")
  const index = Number(rawIndex)
  return root === "questions" && Number.isInteger(index) ? index : null
}

export function groupFormIssues(issues: ValidationIssue[]): GroupedFormIssues {
  const byQuestion = new Map<number, QuestionIssues>()
  const form: string[] = []

  for (const issue of issues) {
    const path = issue.path.startsWith("formSchema.")
      ? issue.path.slice("formSchema.".length)
      : issue.path
    const [root, rawIndex, field, rawChoiceIndex] = path.split(".")
    const index = Number(rawIndex)
    if (root !== "questions" || !Number.isInteger(index)) {
      form.push(issue.message)
      continue
    }

    let entry = byQuestion.get(index)
    if (!entry) {
      entry = { prompt: [], choices: new Map(), other: [] }
      byQuestion.set(index, entry)
    }

    const choiceIndex = Number(rawChoiceIndex)
    if (field === "prompt") {
      entry.prompt.push(issue.message)
    } else if (field === "choices" && Number.isInteger(choiceIndex)) {
      entry.choices.set(choiceIndex, [...(entry.choices.get(choiceIndex) ?? []), issue.message])
    } else {
      entry.other.push(issue.message)
    }
  }

  return { byQuestion, form }
}

function isBlank(answer: SubmissionAnswer | undefined): boolean {
  if (answer === undefined) return true
  if (typeof answer === "string") return answer.trim().length === 0
  return answer.length === 0
}

function validateText(
  question: Extract<FormQuestion, { type: "single-line" | "multiline" }>,
  answer: SubmissionAnswer | undefined,
  issues: ValidationIssue[],
  locale: Locale = getLocale()
) {
  if (answer === undefined || answer === "") return
  if (typeof answer !== "string") {
    issues.push({
      path: `answers.${question.id}`,
      message: m.ui_expected_a_text_answer({}, { locale }),
    })
    return
  }
  if (question.characterLimit && answer.length > question.characterLimit) {
    issues.push({
      path: `answers.${question.id}`,
      message: m.answer_character_limit({ value0: question.characterLimit }, { locale }),
    })
  }
  if (question.type === "single-line" && answer.includes("\n")) {
    issues.push({
      path: `answers.${question.id}`,
      message: m.ui_single_line_answers_cannot_contain_line_breaks({}, { locale }),
    })
  }
  if (question.type === "single-line" && question.validateUrl && answer.trim()) {
    try {
      const url = new URL(answer)
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(m.ui_unsupported_url_protocol({}, { locale }))
      }
    } catch {
      issues.push({
        path: `answers.${question.id}`,
        message: m.ui_enter_a_valid_http_or_https_url({}, { locale }),
      })
    }
  }
}

function validateChoices(
  question: Extract<FormQuestion, { type: "radio" | "checkboxes" }>,
  answer: SubmissionAnswer | undefined,
  issues: ValidationIssue[],
  locale: Locale = getLocale()
) {
  if (answer === undefined) return
  if (!Array.isArray(answer) || answer.some((value) => typeof value !== "string")) {
    issues.push({
      path: `answers.${question.id}`,
      message: m.ui_expected_a_list_of_choices({}, { locale }),
    })
    return
  }
  const selected = answer as string[]
  if (question.type === "radio" && selected.length > 1) {
    issues.push({
      path: `answers.${question.id}`,
      message: m.ui_choose_only_one_option({}, { locale }),
    })
  }
  const allowed = new Set(question.choices.map((choice) => choice.id))
  if (selected.some((choiceId) => !allowed.has(choiceId))) {
    issues.push({
      path: `answers.${question.id}`,
      message: m.ui_an_answer_contains_an_unknown_choice({}, { locale }),
    })
  }
  if (new Set(selected).size !== selected.length) {
    issues.push({
      path: `answers.${question.id}`,
      message: m.duplicate_choice({}, { locale }),
    })
  }
}

function validateImages(
  question: Extract<FormQuestion, { type: "images" }>,
  answer: SubmissionAnswer | undefined,
  uploads: UploadedImageDescriptor[],
  issues: ValidationIssue[],
  locale: Locale = getLocale()
) {
  if (answer !== undefined && !Array.isArray(answer)) {
    issues.push({
      path: `answers.${question.id}`,
      message: m.ui_expected_a_list_of_images({}, { locale }),
    })
  }
  const questionUploads = uploads.filter((upload) => upload.questionId === question.id)
  if (questionUploads.length > question.maxImages) {
    issues.push({
      path: `answers.${question.id}`,
      message: m.image_upload_limit({ value0: question.maxImages }, { locale }),
    })
  }
  for (const upload of questionUploads) {
    const extension = upload.name.split(".").pop()?.toLowerCase() ?? ""
    if (
      !acceptedImageMimeTypes.has(upload.mimeType.toLowerCase()) &&
      !acceptedImageExtensions.has(extension)
    ) {
      issues.push({
        path: `answers.${question.id}.${upload.index}`,
        message: m.unsupported_upload({ value0: upload.name }, { locale }),
      })
    }
    if (upload.sizeBytes > 15 * 1024 * 1024) {
      issues.push({
        path: `answers.${question.id}.${upload.index}`,
        message: m.upload_too_large({ value0: upload.name }, { locale }),
      })
    }
  }
}

export function validateSubmission(
  form: FormSchema,
  answers: SubmissionAnswers,
  uploads: UploadedImageDescriptor[] = [],
  locale: Locale = "en"
): ValidationIssue[] {
  const formResult = formSchemaValidator.safeParse(form)
  if (!formResult.success) {
    return [{ path: "form", message: m.ui_the_published_form_schema_is_invalid({}, { locale }) }]
  }

  const issues: ValidationIssue[] = []
  const knownQuestionIds = new Set(form.questions.map((question) => question.id))
  for (const answerId of Object.keys(answers)) {
    if (!knownQuestionIds.has(answerId)) {
      issues.push({
        path: `answers.${answerId}`,
        message: m.ui_the_answer_does_not_belong_to_this_form({}, { locale }),
      })
    }
  }
  for (const upload of uploads) {
    if (!knownQuestionIds.has(upload.questionId)) {
      issues.push({
        path: `uploads.${upload.questionId}`,
        message: m.ui_the_image_does_not_belong_to_this_form({}, { locale }),
      })
    }
  }

  for (const question of form.questions) {
    const answer = answers[question.id]
    const questionUploads = uploads.filter((upload) => upload.questionId === question.id)
    const empty = question.type === "images" ? questionUploads.length === 0 : isBlank(answer)
    if (question.required && empty) {
      issues.push({
        path: `answers.${question.id}`,
        message:
          question.type === "checkboxes"
            ? m.ui_select_at_least_one_option({}, { locale })
            : m.ui_this_question_is_required({}, { locale }),
      })
      continue
    }

    switch (question.type) {
      case "single-line":
      case "multiline":
        validateText(question, answer, issues, locale)
        break
      case "radio":
      case "checkboxes":
        validateChoices(question, answer, issues, locale)
        break
      case "images":
        validateImages(question, answer, uploads, issues, locale)
        break
    }
  }

  const totalBytes = uploads.reduce((sum, upload) => sum + upload.sizeBytes, 0)
  if (totalBytes > 50 * 1024 * 1024) {
    issues.push({
      path: "uploads",
      message: m.ui_all_images_in_one_submission_must_total_no_more_than_50_mb({}, { locale }),
    })
  }
  return issues
}

/** Validate the editable part of an existing response without revalidating stored image uploads. */
export function validateEditedTextAnswers(
  form: FormSchema,
  answers: SubmissionAnswers
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const question of form.questions) {
    if (question.type !== "single-line" && question.type !== "multiline") continue
    const answer = answers[question.id]
    if (question.required && isBlank(answer)) {
      issues.push({ path: `answers.${question.id}`, message: m.ui_this_question_is_required() })
      continue
    }
    validateText(question, answer, issues)
  }
  return issues
}

export function emptyFormSchema(): FormSchema {
  return { version: FORM_SCHEMA_VERSION, questions: [] }
}

export function emptyAnswerForQuestion(question: FormQuestion): string | string[] | ImageAnswer[] {
  if (question.type === "radio" || question.type === "checkboxes" || question.type === "images") {
    return []
  }
  return ""
}
