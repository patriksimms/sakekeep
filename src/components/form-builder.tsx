import * as m from "#/paraglide/messages.js"
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  CopyIcon,
  ImageIcon,
  LinkIcon,
  LoaderCircleIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import {
  type FormQuestion,
  type FormSchema,
  type Project,
  type QuestionType,
} from "#/domain/types.ts"
import {
  groupFormIssues,
  questionIndexForIssue,
  type QuestionIssues,
  type ValidationIssue,
  validateFormForPublish,
} from "#/domain/form.ts"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#/components/ui/alert-dialog.tsx"
import { Badge } from "#/components/ui/badge.tsx"
import { Button } from "#/components/ui/button.tsx"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#/components/ui/field.tsx"
import { Input } from "#/components/ui/input.tsx"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx"
import { Switch } from "#/components/ui/switch.tsx"
import { Textarea } from "#/components/ui/textarea.tsx"
import { ApiError, projectApi } from "#/lib/api.ts"

type SaveState = "saved" | "unsaved" | "saving" | "failed"

const typeLabels: Record<QuestionType, string> = {
  get "single-line"() {
    return m.ui_single_line_text()
  },
  get multiline() {
    return m.ui_multiline_text()
  },
  get radio() {
    return m.ui_radio_buttons()
  },
  get checkboxes() {
    return m.ui_checkboxes()
  },
  get images() {
    return m.ui_image_upload()
  },
}

function newQuestion(type: QuestionType): FormQuestion {
  const base = {
    id: crypto.randomUUID(),
    prompt: "",
    required: false,
  }
  if (type === "single-line") {
    return { ...base, type, validateUrl: false }
  }
  if (type === "multiline") return { ...base, type }
  if (type === "images") return { ...base, type, maxImages: 1 }
  return {
    ...base,
    type,
    choices: [
      { id: crypto.randomUUID(), label: m.ui_option_1() },
      { id: crypto.randomUUID(), label: m.ui_option_2() },
    ],
  }
}

function SaveIndicator({ state }: { state: SaveState }) {
  const content = {
    saved: { icon: CheckIcon, label: m.ui_saved() },
    unsaved: { icon: SaveIcon, label: m.ui_unsaved_changes() },
    saving: { icon: LoaderCircleIcon, label: m.ui_saving() },
    failed: { icon: XCircleIcon, label: m.ui_save_failed() },
  }[state]
  return (
    <span
      data-testid="save-status"
      data-save-state={state}
      role="status"
      className="flex items-center gap-1.5 text-sm text-muted-foreground"
    >
      <content.icon
        aria-hidden="true"
        className={state === "saving" ? "animate-spin" : undefined}
      />
      {content.label}
    </span>
  )
}

/**
 * The server reports rejected saves as `{ error, details: { issues } }`. Without this the issue
 * list is dropped and the organizer only ever sees the generic headline.
 */
function validationIssuesFrom(error: unknown): ValidationIssue[] {
  if (!(error instanceof ApiError)) return []
  const details = error.details
  if (typeof details !== "object" || details === null || !("issues" in details)) return []
  const issues = (details as { issues: unknown }).issues
  if (!Array.isArray(issues)) return []
  return issues.filter(
    (issue): issue is ValidationIssue =>
      typeof issue === "object" &&
      issue !== null &&
      typeof (issue as ValidationIssue).path === "string" &&
      typeof (issue as ValidationIssue).message === "string"
  )
}

/** Toast headline companion for issues that have no field to sit next to on screen. */
function describeIssues(issues: ValidationIssue[]): string {
  const messages = [...new Set(issues.map((issue) => issue.message))]
  return messages.slice(0, 3).join(" · ") + (messages.length > 3 ? " …" : "")
}

/**
 * Publish-blocking issues are listed away from the inputs, and an empty prompt reads identically
 * for every question, so the message alone does not say which card to open.
 */
function describePublishIssue(issue: ValidationIssue): string {
  const index = questionIndexForIssue(issue)
  return index === null
    ? issue.message
    : m.question_issue({ value0: index + 1, value1: issue.message })
}

/** Adapt our plain message strings to the shape `FieldError` renders. */
function asErrors(messages: string[] | undefined) {
  return messages?.length ? messages.map((message) => ({ message })) : undefined
}

interface QuestionEditorProps {
  question: FormQuestion
  index: number
  count: number
  issues: QuestionIssues | undefined
  onChange: (question: FormQuestion) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}

function QuestionEditor({
  question,
  index,
  count,
  issues,
  onChange,
  onMove,
  onRemove,
}: QuestionEditorProps) {
  const update = <T extends FormQuestion>(changes: Partial<T>) =>
    onChange({ ...question, ...changes } as FormQuestion)

  const promptErrors = asErrors(issues?.prompt)
  const otherErrors = asErrors(issues?.other)

  return (
    <Card className="bg-card/90" data-testid="question-card">
      <CardHeader>
        <CardTitle data-testid="heading-untitled-question" className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-muted font-sans text-xs">
            {index + 1}
          </span>
          {question.prompt || m.ui_untitled_question()}
        </CardTitle>
        <CardDescription>{typeLabels[question.type]}</CardDescription>
        <CardAction className="flex items-center gap-1">
          <Button
            data-testid="button-move-question-up"
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={m.ui_move_question_up()}
          >
            <ArrowUpIcon />
          </Button>
          <Button
            data-testid="button-move-question-down"
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            aria-label={m.ui_move_question_down()}
          >
            <ArrowDownIcon />
          </Button>
          <Button
            data-testid="button-delete-question"
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            aria-label={m.ui_delete_question()}
          >
            <Trash2Icon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field data-invalid={promptErrors ? true : undefined}>
            <FieldLabel htmlFor={`prompt-${question.id}`}>{m.ui_question()}</FieldLabel>
            <Textarea
              id={`prompt-${question.id}`}
              data-testid="question-prompt"
              value={question.prompt}
              onChange={(event) => update({ prompt: event.target.value })}
              placeholder={m.ui_what_will_you_always_remember_about_us()}
              rows={2}
              maxLength={500}
              aria-invalid={promptErrors ? true : undefined}
              aria-describedby={promptErrors ? `prompt-error-${question.id}` : undefined}
            />
            <FieldError id={`prompt-error-${question.id}`} errors={promptErrors} />
          </Field>
          <Field orientation="horizontal">
            <Switch
              id={`required-${question.id}`}
              checked={question.required}
              onCheckedChange={(checked) => update({ required: checked === true })}
            />
            <FieldLabel htmlFor={`required-${question.id}`}>{m.ui_required_answer()}</FieldLabel>
          </Field>

          {(question.type === "single-line" || question.type === "multiline") && (
            <Field>
              <FieldLabel htmlFor={`limit-${question.id}`}>
                {m.ui_character_limit()}{" "}
                <span className="text-muted-foreground">{m.ui_optional()}</span>
              </FieldLabel>
              <Input
                id={`limit-${question.id}`}
                type="number"
                min={1}
                max={100000}
                value={question.characterLimit ?? ""}
                onChange={(event) =>
                  update({
                    characterLimit: event.target.value ? Number(event.target.value) : undefined,
                  })
                }
              />
              <FieldDescription>
                {m.ui_positive_values_are_enforced_in_the_browser_and_on_the_server()}{" "}
              </FieldDescription>
            </Field>
          )}

          {question.type === "single-line" && (
            <Field orientation="horizontal">
              <Switch
                id={`url-${question.id}`}
                checked={question.validateUrl ?? false}
                onCheckedChange={(checked) => update({ validateUrl: checked === true })}
              />
              <FieldLabel htmlFor={`url-${question.id}`}>
                <LinkIcon aria-hidden="true" />
                {m.ui_validate_as_an_http_or_https_url()}{" "}
              </FieldLabel>
            </Field>
          )}

          {(question.type === "radio" || question.type === "checkboxes") && (
            <Field>
              <FieldLabel>{m.ui_ordered_choices()}</FieldLabel>
              <div className="flex flex-col gap-2">
                {question.choices.map((choice, choiceIndex) => {
                  const choiceErrors = asErrors(issues?.choices.get(choiceIndex))
                  return (
                    <div key={choice.id} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Input
                          value={choice.label}
                          aria-label={m.choice_number({ value0: choiceIndex + 1 })}
                          aria-invalid={choiceErrors ? true : undefined}
                          aria-describedby={choiceErrors ? `choice-error-${choice.id}` : undefined}
                          onChange={(event) =>
                            update({
                              choices: question.choices.map((candidate) =>
                                candidate.id === choice.id
                                  ? { ...candidate, label: event.target.value }
                                  : candidate
                              ),
                            })
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={m.move_choice_up({ value0: choiceIndex + 1 })}
                          disabled={choiceIndex === 0}
                          onClick={() => {
                            const choices = [...question.choices]
                            const [moved] = choices.splice(choiceIndex, 1)
                            choices.splice(choiceIndex - 1, 0, moved!)
                            update({ choices })
                          }}
                        >
                          <ArrowUpIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={m.move_choice_down({ value0: choiceIndex + 1 })}
                          disabled={choiceIndex === question.choices.length - 1}
                          onClick={() => {
                            const choices = [...question.choices]
                            const [moved] = choices.splice(choiceIndex, 1)
                            choices.splice(choiceIndex + 1, 0, moved!)
                            update({ choices })
                          }}
                        >
                          <ArrowDownIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={m.delete_choice({ value0: choiceIndex + 1 })}
                          disabled={question.choices.length <= 2}
                          onClick={() =>
                            update({
                              choices: question.choices.filter(
                                (candidate) => candidate.id !== choice.id
                              ),
                            })
                          }
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                      <FieldError id={`choice-error-${choice.id}`} errors={choiceErrors} />
                    </div>
                  )
                })}
              </div>
              <Button
                data-testid="button-add-choice"
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() =>
                  update({
                    choices: [
                      ...question.choices,
                      {
                        id: crypto.randomUUID(),
                        label: m.new_choice_label({ value0: question.choices.length + 1 }),
                      },
                    ],
                  })
                }
              >
                <PlusIcon data-icon="inline-start" />
                {m.ui_add_choice()}{" "}
              </Button>
            </Field>
          )}

          {question.type === "images" && (
            <Field>
              <FieldLabel htmlFor={`max-images-${question.id}`}>{m.ui_maximum_images()}</FieldLabel>
              <Input
                id={`max-images-${question.id}`}
                type="number"
                min={1}
                max={10}
                value={question.maxImages}
                onChange={(event) =>
                  update({
                    maxImages: Math.min(10, Math.max(1, Number(event.target.value))),
                  })
                }
              />
              <FieldDescription>
                {m.ui_jpeg_png_webp_heif_and_heic_up_to_15_mb_per_source_image()}{" "}
              </FieldDescription>
            </Field>
          )}

          <FieldError errors={otherErrors} />
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-between text-xs text-muted-foreground">
        <span>
          {m.ui_question_id()} {question.id.slice(0, 8)}
        </span>
        {question.required && <Badge variant="outline">{m.ui_required()}</Badge>}
      </CardFooter>
    </Card>
  )
}

interface FormBuilderProps {
  project: Project
  onProjectChange: (project: Project) => void
}

export function FormBuilder({ project, onProjectChange }: FormBuilderProps) {
  const [form, setForm] = useState(project.formSchema)
  const [saveState, setSaveState] = useState<SaveState>("saved")
  const [addType, setAddType] = useState<QuestionType>("single-line")
  const [saveIssues, setSaveIssues] = useState<ValidationIssue[]>([])
  const revisionRef = useRef(project.formRevision)
  const formRef = useRef(form)
  const editVersion = useRef(0)
  const savedVersion = useRef(0)
  const saveInFlight = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    revisionRef.current = project.formRevision
    if (saveState === "saved") {
      setForm(project.formSchema)
      formRef.current = project.formSchema
    }
  }, [project.formRevision, project.formSchema, saveState])

  const save = useCallback(async () => {
    if (savedVersion.current === editVersion.current) return
    if (saveInFlight.current) return
    saveInFlight.current = true
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const version = editVersion.current
    const value = formRef.current
    setSaveState("saving")
    try {
      const updated = await projectApi.update(project.id, {
        formSchema: value,
        expectedRevision: revisionRef.current,
      })
      revisionRef.current = updated.formRevision
      savedVersion.current = version
      setSaveIssues([])
      onProjectChange(updated)
      if (savedVersion.current === editVersion.current) {
        setSaveState("saved")
      } else {
        setSaveState("unsaved")
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => void save(), 400)
      }
    } catch (error) {
      // Issue paths are positional, so a response that describes a superseded payload would
      // pin its errors on whichever question now occupies that index. The edit that superseded
      // it has already queued its own save; let that one report the real state.
      if (version !== editVersion.current) {
        setSaveState("unsaved")
        // That newer edit's own save was suppressed while this one was in flight, so retry it
        // here the way the success path does; otherwise it waits for the next keystroke.
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => void save(), 400)
        return
      }
      setSaveState("failed")
      const issues = validationIssuesFrom(error)
      setSaveIssues(issues)
      toast.error(error instanceof Error ? error.message : m.ui_autosave_failed(), {
        description: issues.length > 0 ? describeIssues(issues) : undefined,
      })
    } finally {
      saveInFlight.current = false
    }
  }, [onProjectChange, project.id])

  useEffect(() => {
    const beforeUnload = () => {
      if (savedVersion.current === editVersion.current) return
      void fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formSchema: formRef.current,
          expectedRevision: revisionRef.current,
        }),
        keepalive: true,
      })
    }
    window.addEventListener("beforeunload", beforeUnload)
    return () => {
      window.removeEventListener("beforeunload", beforeUnload)
      if (timer.current) clearTimeout(timer.current)
      void save()
    }
  }, [project.id, save])

  const change = (next: FormSchema) => {
    setForm(next)
    formRef.current = next
    editVersion.current += 1
    setSaveState("unsaved")
    // The stale inline errors describe a payload that no longer exists.
    setSaveIssues([])
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), 700)
  }

  const issues = useMemo(() => validateFormForPublish(form), [form])
  const grouped = useMemo(() => groupFormIssues(saveIssues), [saveIssues])

  const archived = Boolean(project.archivedAt)
  if (project.state !== "draft" || archived) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 data-testid="heading-archived-form" className="font-heading text-2xl">
              {archived ? m.ui_archived_form() : m.ui_published_form()}
            </h2>
            <p className="text-sm text-muted-foreground">
              {archived
                ? m.ui_unarchive_the_project_to_keep_editing_this_form()
                : m.ui_this_revision_is_permanently_frozen()}
            </p>
          </div>
          {/* An archived draft has no published revision to copy from. */}
          {project.state !== "draft" && (
            <AlertDialog>
              <AlertDialogTrigger
                data-testid="button-duplicate-as-draft"
                render={<Button variant="outline" />}
              >
                <CopyIcon data-icon="inline-start" />
                {m.ui_duplicate_as_draft()}{" "}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle data-testid="heading-duplicate-this-project">
                    {m.ui_duplicate_this_project()}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {m.ui_the_new_draft_copies_the_form_and_layouts_but_never_the_share_tok()}{" "}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel">{m.ui_cancel()}</AlertDialogCancel>
                  <AlertDialogAction
                    data-testid="button-create-draft-copy"
                    onClick={async () => {
                      try {
                        const duplicate = await projectApi.action(project.id, "duplicate")
                        window.location.assign(`/projects/${duplicate.id}`)
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : m.ui_could_not_duplicate_project()
                        )
                      }
                    }}
                  >
                    {m.ui_create_draft_copy()}{" "}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        <div className="grid gap-4">
          {form.questions.map((question, index) => (
            <Card key={question.id} className="bg-card/80">
              <CardHeader>
                <CardTitle>
                  {index + 1}. {question.prompt}
                </CardTitle>
                <CardDescription>
                  {typeLabels[question.type]} ·{" "}
                  {question.required ? m.ui_required() : m.ui_optional_165()}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 data-testid="heading-build-the-questionnaire" className="font-heading text-2xl">
            {m.ui_build_the_questionnaire()}
          </h2>
          <p className="text-sm text-muted-foreground">
            {m.ui_changes_autosave_with_revision_checks_publishing_freezes_this_for()}{" "}
          </p>
        </div>
        <SaveIndicator state={saveState} />
      </div>

      <Card className="bg-card/80">
        <CardHeader>
          <CardTitle data-testid="heading-add-a-question">{m.ui_add_a_question()}</CardTitle>
          <CardDescription>
            {m.ui_every_documented_answer_type_can_be_mixed_and_reordered()}{" "}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Select
            items={Object.entries(typeLabels).map(([value, label]) => ({ value, label }))}
            value={addType}
            onValueChange={(value) => setAddType(value as QuestionType)}
          >
            <SelectTrigger
              data-testid="combobox-question-type-to-add"
              className="w-full sm:w-64"
              aria-label={m.ui_question_type_to_add()}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(typeLabels).map(([value, label]) => (
                  <SelectItem data-testid={`question-type-${value}`} key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            data-testid="button-add"
            type="button"
            onClick={() =>
              change({
                ...form,
                questions: [...form.questions, newQuestion(addType)],
              })
            }
          >
            {addType === "images" ? (
              <ImageIcon data-icon="inline-start" />
            ) : (
              <PlusIcon data-icon="inline-start" />
            )}
            {m.ui_add()} {typeLabels[addType].toLowerCase()}
          </Button>
        </CardContent>
      </Card>

      {form.questions.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-heading text-lg">{m.ui_the_first_page_is_still_blank()}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {m.ui_add_at_least_one_valid_question_before_publishing()}{" "}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {form.questions.map((question, index) => (
            <QuestionEditor
              key={question.id}
              question={question}
              index={index}
              count={form.questions.length}
              issues={grouped.byQuestion.get(index)}
              onChange={(updated) =>
                change({
                  ...form,
                  questions: form.questions.map((candidate) =>
                    candidate.id === question.id ? updated : candidate
                  ),
                })
              }
              onMove={(direction) => {
                const questions = [...form.questions]
                const [moved] = questions.splice(index, 1)
                questions.splice(index + direction, 0, moved!)
                change({ ...form, questions })
              }}
              onRemove={() =>
                change({
                  ...form,
                  questions: form.questions.filter((candidate) => candidate.id !== question.id),
                })
              }
            />
          ))}
        </div>
      )}

      {grouped.form.length > 0 && (
        <Card className="border-destructive/50 bg-card/80">
          <CardHeader>
            <CardTitle
              data-testid="heading-this-form-could-not-be-saved"
              className="flex items-center gap-2 text-destructive"
            >
              <AlertTriangleIcon aria-hidden="true" />
              {m.ui_this_form_could_not_be_saved()}{" "}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul
              role="alert"
              className="flex list-disc flex-col gap-1 pl-5 text-sm text-destructive"
            >
              {grouped.form.map((message, index) => (
                <li key={`${message}-${index}`}>{message}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {issues.length > 0 && (
        <Card className="bg-card/80">
          <CardHeader>
            <CardTitle data-testid="heading-before-you-publish" className="flex items-center gap-2">
              <AlertTriangleIcon aria-hidden="true" />
              {m.ui_before_you_publish()}{" "}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
              {issues.map((issue, index) => (
                <li key={`${issue.path}-${index}`}>{describePublishIssue(issue)}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <AlertDialog>
          <AlertDialogTrigger
            data-testid="button-publish-and-create-share-link"
            render={
              <Button
                size="lg"
                disabled={
                  issues.length > 0 ||
                  saveState === "saving" ||
                  saveState === "unsaved" ||
                  saveState === "failed"
                }
              />
            }
          >
            {m.ui_publish_and_create_share_link()}{" "}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle data-testid="heading-publish-this-form-permanently">
                {m.ui_publish_this_form_permanently()}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {m.ui_publishing_creates_an_unguessable_public_link_and_freezes_this_ex()}{" "}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-keep-editing">
                {m.ui_keep_editing()}
              </AlertDialogCancel>
              <AlertDialogAction
                data-testid="button-publish-forever"
                onClick={async () => {
                  try {
                    const updated = await projectApi.action(project.id, "publish")
                    onProjectChange(updated)
                    toast.success(m.ui_form_published())
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : m.ui_publish_failed())
                  }
                }}
              >
                {m.ui_publish_forever()}{" "}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
