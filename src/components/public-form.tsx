import { type Locale } from "#/lib/locale.ts"
import * as m from "#/paraglide/messages.js"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  FileImageIcon,
  ImagePlusIcon,
  LoaderCircleIcon,
  LockKeyholeIcon,
  RefreshCwIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"

import { type FormQuestion, type FormSchema, type SubmissionAnswers } from "#/domain/types.ts"
import {
  acceptedImageExtensions,
  acceptedImageMimeTypes,
  emptyAnswerForQuestion,
  validateSubmission,
  type ValidationIssue,
} from "#/domain/form.ts"
import {
  clearContributorDraft,
  loadContributorDraft,
  saveContributorDraft,
} from "#/lib/contributor-drafts.ts"
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx"
import { Button } from "#/components/ui/button.tsx"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.tsx"
import { Checkbox } from "#/components/ui/checkbox.tsx"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "#/components/ui/field.tsx"
import { Input } from "#/components/ui/input.tsx"
import { Progress, ProgressLabel, ProgressValue } from "#/components/ui/progress.tsx"
import { RadioGroup, RadioGroupItem } from "#/components/ui/radio-group.tsx"
import { Textarea } from "#/components/ui/textarea.tsx"

interface PublicFormProps {
  locale?: Locale
  token: string
  title: string
  formSchema: FormSchema
}

function initialAnswers(schema: FormSchema): SubmissionAnswers {
  return Object.fromEntries(
    schema.questions.map((question) => [question.id, emptyAnswerForQuestion(question)])
  )
}

function errorFor(issues: ValidationIssue[], questionId: string) {
  return issues.find((issue) => issue.path.startsWith(`answers.${questionId}`))?.message
}

function FilePreview({
  file,
  onRemove,
  locale,
}: {
  file: File
  onRemove: () => void
  locale: Locale
}) {
  const [url, setUrl] = useState("")
  useEffect(() => {
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  return (
    <li className="flex items-center gap-3 rounded-xl border bg-background p-2">
      {url ? (
        <img src={url} alt="" className="size-14 rounded-lg object-cover" aria-hidden="true" />
      ) : (
        <span className="flex size-14 items-center justify-center rounded-lg bg-muted">
          <FileImageIcon aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{file.name}</p>
        <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
      </div>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        onClick={onRemove}
        data-testid={`remove-file-${file.name}`}
        aria-label={m.remove_file({ value0: file.name }, { locale })}
      >
        <Trash2Icon />
      </Button>
    </li>
  )
}

function isAcceptedImage(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? ""
  return (
    acceptedImageMimeTypes.has(file.type.toLowerCase()) || acceptedImageExtensions.has(extension)
  )
}

function ImagesField({
  locale,
  question,
  files,
  issue,
  onFiles,
}: {
  question: Extract<FormQuestion, { type: "images" }>
  locale: Locale
  files: File[]
  issue?: string
  onFiles: (files: File[]) => void
}) {
  const fieldId = `answer-${question.id}`
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState("")

  const addFiles = (candidates: File[]) => {
    const images = candidates.filter(isAcceptedImage)
    const free = Math.max(0, question.maxImages - files.length)
    const accepted = images.slice(0, free)
    if (accepted.length > 0) onFiles([...files, ...accepted])
    setNotice(
      [
        images.length < candidates.length &&
          m.ui_only_jpeg_png_webp_heif_or_heic_images_can_be_added({}, { locale }),
        accepted.length < images.length &&
          m.image_limit_notice({ value0: question.maxImages }, { locale }),
      ]
        .filter(Boolean)
        .join(" ")
    )
  }

  return (
    <Field data-invalid={issue ? true : undefined}>
      <FieldLabel htmlFor={fieldId}>
        {question.prompt} {question.required && <span aria-hidden="true">*</span>}
      </FieldLabel>
      <label
        htmlFor={fieldId}
        data-dragging={dragging ? "true" : undefined}
        className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/40 p-5 text-center hover:bg-muted focus-within:ring-3 focus-within:ring-ring/50 data-[dragging=true]:border-primary data-[dragging=true]:bg-primary/5 data-[dragging=true]:ring-3 data-[dragging=true]:ring-primary/20"
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
          setDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          addFiles(Array.from(event.dataTransfer?.files ?? []))
        }}
      >
        <ImagePlusIcon aria-hidden="true" />
        <span className="text-sm font-medium">
          {m.upload_hint({ count: question.maxImages }, { locale })}
        </span>
        <span className="text-xs text-muted-foreground">
          {m.ui_jpeg_png_webp_heif_or_heic_15_mb_each({}, { locale })}{" "}
        </span>
        <input
          id={fieldId}
          data-testid={fieldId}
          className="sr-only"
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.heif,.heic,image/jpeg,image/png,image/webp,image/heif,image/heic"
          multiple={question.maxImages > 1}
          aria-invalid={issue ? true : undefined}
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []))
            event.target.value = ""
          }}
        />
      </label>
      <FieldDescription role="status" className={notice ? undefined : "sr-only"}>
        {notice}
      </FieldDescription>
      {files.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {files.map((file, index) => (
            <FilePreview
              locale={locale}
              key={`${file.name}-${file.lastModified}-${index}`}
              file={file}
              onRemove={() => {
                setNotice("")
                onFiles(files.filter((_candidate, itemIndex) => itemIndex !== index))
              }}
            />
          ))}
        </ul>
      )}
      <FieldError>{issue}</FieldError>
    </Field>
  )
}

function QuestionField({
  locale,
  question,
  answer,
  files,
  issue,
  onAnswer,
  onFiles,
}: {
  question: FormQuestion
  answer: SubmissionAnswers[string]
  locale: Locale
  files: File[]
  issue?: string
  onAnswer: (answer: SubmissionAnswers[string]) => void
  onFiles: (files: File[]) => void
}) {
  const fieldId = `answer-${question.id}`
  if (question.type === "radio") {
    return (
      <FieldSet data-invalid={issue ? true : undefined}>
        <FieldLegend>
          {question.prompt} {question.required && <span aria-hidden="true">*</span>}
        </FieldLegend>
        <RadioGroup
          value={Array.isArray(answer) ? ((answer[0] as string | undefined) ?? "") : ""}
          onValueChange={(value) => onAnswer(value ? [value] : [])}
          aria-invalid={issue ? true : undefined}
        >
          {question.choices.map((choice) => (
            <Field key={choice.id} orientation="horizontal">
              <RadioGroupItem id={`${fieldId}-${choice.id}`} value={choice.id} />
              <FieldLabel htmlFor={`${fieldId}-${choice.id}`}>{choice.label}</FieldLabel>
            </Field>
          ))}
        </RadioGroup>
        <FieldError>{issue}</FieldError>
      </FieldSet>
    )
  }
  if (question.type === "checkboxes") {
    const selected = Array.isArray(answer)
      ? answer.filter((item): item is string => typeof item === "string")
      : []
    return (
      <FieldSet data-invalid={issue ? true : undefined}>
        <FieldLegend>
          {question.prompt} {question.required && <span aria-hidden="true">*</span>}
        </FieldLegend>
        {question.choices.map((choice) => (
          <Field key={choice.id} orientation="horizontal">
            <Checkbox
              id={`${fieldId}-${choice.id}`}
              checked={selected.includes(choice.id)}
              onCheckedChange={(checked) =>
                onAnswer(
                  checked ? [...selected, choice.id] : selected.filter((id) => id !== choice.id)
                )
              }
              aria-invalid={issue ? true : undefined}
            />
            <FieldLabel htmlFor={`${fieldId}-${choice.id}`}>{choice.label}</FieldLabel>
          </Field>
        ))}
        <FieldError>{issue}</FieldError>
      </FieldSet>
    )
  }
  if (question.type === "images") {
    return (
      <ImagesField
        locale={locale}
        question={question}
        files={files}
        issue={issue}
        onFiles={onFiles}
      />
    )
  }

  if (question.type !== "single-line" && question.type !== "multiline") {
    return null
  }
  const value = typeof answer === "string" ? answer : ""
  return (
    <Field data-invalid={issue ? true : undefined}>
      <FieldLabel htmlFor={fieldId}>
        {question.prompt} {question.required && <span aria-hidden="true">*</span>}
      </FieldLabel>
      {question.type === "multiline" ? (
        <Textarea
          id={fieldId}
          data-testid={fieldId}
          value={value}
          rows={5}
          maxLength={question.characterLimit}
          required={question.required}
          aria-invalid={issue ? true : undefined}
          aria-describedby={question.characterLimit ? `${fieldId}-description` : undefined}
          onChange={(event) => onAnswer(event.target.value)}
        />
      ) : (
        <Input
          id={fieldId}
          data-testid={fieldId}
          value={value}
          type={question.validateUrl ? "url" : "text"}
          maxLength={question.characterLimit}
          required={question.required}
          aria-invalid={issue ? true : undefined}
          aria-describedby={question.characterLimit ? `${fieldId}-description` : undefined}
          onChange={(event) => onAnswer(event.target.value)}
        />
      )}
      {question.characterLimit && (
        <FieldDescription id={`${fieldId}-description`}>
          {value.length} / {question.characterLimit} {m.ui_characters({}, { locale })}{" "}
        </FieldDescription>
      )}
      <FieldError>{issue}</FieldError>
    </Field>
  )
}

export function PublicForm({ token, title, formSchema, locale = "en" }: PublicFormProps) {
  const [answers, setAnswers] = useState(() => initialAnswers(formSchema))
  const [files, setFiles] = useState<Record<string, File[]>>({})
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID())
  const [loaded, setLoaded] = useState(false)
  const [recovered, setRecovered] = useState(false)
  const [consented, setConsented] = useState(false)
  const [issues, setIssues] = useState<ValidationIssue[]>([])
  const [status, setStatus] = useState<"editing" | "submitting" | "success" | "error">("editing")
  const [message, setMessage] = useState("")
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let active = true
    void loadContributorDraft(token).then((draft) => {
      if (!active) return
      if (draft) {
        setAnswers({ ...initialAnswers(formSchema), ...draft.answers })
        setFiles(draft.files)
        setIdempotencyKey(draft.idempotencyKey)
        setRecovered(true)
      }
      setLoaded(true)
    })
    return () => {
      active = false
    }
  }, [formSchema, token])

  useEffect(() => {
    if (!loaded || status === "success") return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void saveContributorDraft({
        token,
        answers,
        files,
        idempotencyKey,
        updatedAt: new Date().toISOString(),
      })
    }, 450)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [answers, files, idempotencyKey, loaded, status, token])

  useEffect(() => {
    if (!loaded || status === "success") return
    const flushDraft = () => {
      void saveContributorDraft({
        token,
        answers,
        files,
        idempotencyKey,
        updatedAt: new Date().toISOString(),
      })
    }
    window.addEventListener("pagehide", flushDraft)
    return () => window.removeEventListener("pagehide", flushDraft)
  }, [answers, files, idempotencyKey, loaded, status, token])

  const answeredCount = useMemo(
    () =>
      formSchema.questions.filter((question) => {
        if (question.type === "images") return (files[question.id]?.length ?? 0) > 0
        const answer = answers[question.id]
        return typeof answer === "string"
          ? Boolean(answer.trim())
          : Array.isArray(answer) && answer.length > 0
      }).length,
    [answers, files, formSchema.questions]
  )

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!consented) return
    const descriptors = Object.entries(files).flatMap(([questionId, values]) =>
      values.map((file, index) => ({
        questionId,
        index,
        name: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      }))
    )
    const validation = validateSubmission(formSchema, answers, descriptors, locale)
    setIssues(validation)
    if (validation.length > 0) {
      setStatus("error")
      setMessage(m.ui_review_the_highlighted_answers_before_submitting({}, { locale }))
      document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus()
      return
    }
    setStatus("submitting")
    setMessage("")
    const data = new FormData()
    data.set("payload", JSON.stringify({ idempotencyKey, answers }))
    for (const [questionId, values] of Object.entries(files)) {
      values.forEach((file, index) => data.append(`file:${questionId}:${index}`, file, file.name))
    }
    try {
      const response = await fetch(`/api/share/${token}`, {
        method: "POST",
        body: data,
      })
      const payload = (await response.json()) as {
        error?: string
        message?: string
      }
      if (!response.ok) throw new Error(payload.error ?? m.ui_submission_failed({}, { locale }))
      await clearContributorDraft(token)
      setStatus("success")
      setMessage(payload.message ?? m.ui_your_response_was_submitted({}, { locale }))
    } catch (error) {
      setStatus("error")
      setMessage(
        error instanceof Error
          ? error.message
          : m.ui_the_response_could_not_be_submitted({}, { locale })
      )
    }
  }

  if (!loaded) {
    return (
      <div className="flex min-h-80 items-center justify-center">
        <LoaderCircleIcon
          className="animate-spin"
          aria-label={m.ui_restoring_draft({}, { locale })}
        />
      </div>
    )
  }

  if (status === "success") {
    return (
      <Card className="mx-auto max-w-xl bg-card/95 text-center">
        <CardHeader className="place-items-center">
          <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <CheckCircle2Icon aria-hidden="true" />
          </span>
          <CardTitle data-testid="heading-thank-you" className="text-3xl">
            {m.ui_thank_you({}, { locale })}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p>{message}</p>
          <p className="text-sm text-muted-foreground">
            {m.ui_your_saved_browser_draft_and_local_image_copies_have_been_cleared(
              {},
              { locale }
            )}{" "}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 flex flex-col gap-4 text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <LockKeyholeIcon aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold tracking-[0.15em] text-primary uppercase">
            {m.ui_an_anonymous_contribution({}, { locale })}{" "}
          </p>
          <h1 className="mt-2 font-heading text-4xl tracking-tight sm:text-5xl">{title}</h1>
        </div>
        <p className="mx-auto max-w-lg text-muted-foreground">
          {m.ui_no_account_is_needed_your_answers_stay_editable_on_this_device_un(
            {},
            { locale }
          )}{" "}
        </p>
      </div>

      {recovered && (
        <Alert className="mb-5">
          <RefreshCwIcon />
          <AlertTitle data-testid="text-ui_draft_restored">
            {m.ui_draft_restored({}, { locale })}
          </AlertTitle>
          <AlertDescription>
            {m.ui_your_answers_and_selected_local_images_were_recovered_from_this_b(
              {},
              { locale }
            )}{" "}
          </AlertDescription>
        </Alert>
      )}

      <Progress
        value={(answeredCount / formSchema.questions.length) * 100}
        className="mb-5 rounded-xl border bg-card/80 p-3"
      >
        <ProgressLabel>{m.ui_your_progress({}, { locale })}</ProgressLabel>
        <ProgressValue>
          {() =>
            m.answer_progress(
              { value0: answeredCount, value1: formSchema.questions.length },
              { locale }
            )
          }
        </ProgressValue>
      </Progress>

      <form onSubmit={submit}>
        <Card className="bg-card/95">
          <CardContent>
            <FieldGroup>
              {formSchema.questions.map((question) => (
                <QuestionField
                  locale={locale}
                  key={question.id}
                  question={question}
                  answer={answers[question.id]}
                  files={files[question.id] ?? []}
                  issue={errorFor(issues, question.id)}
                  onAnswer={(answer) =>
                    setAnswers((current) => ({
                      ...current,
                      [question.id]: answer,
                    }))
                  }
                  onFiles={(next) =>
                    setFiles((current) => ({
                      ...current,
                      [question.id]: next,
                    }))
                  }
                />
              ))}
            </FieldGroup>
          </CardContent>
          <div className="border-t bg-muted/35 p-4">
            {status === "error" && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircleIcon />
                <AlertTitle>{m.ui_could_not_submit({}, { locale })}</AlertTitle>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}
            <Field orientation="horizontal" className="mb-4">
              <Checkbox
                id="privacy-consent"
                data-testid="contribution-consent"
                checked={consented}
                onCheckedChange={(checked) => setConsented(checked === true)}
              />
              <FieldContent>
                <FieldLabel htmlFor="privacy-consent" className="font-normal">
                  {m.ui_i_agree_that_my_answers_and_any_images_i_upload_are_processed_for(
                    {},
                    { locale }
                  )}{" "}
                </FieldLabel>
                <FieldDescription>
                  {m.ui_read_the({}, { locale })}{" "}
                  <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary">
                    {m.ui_privacy_policy({}, { locale })}{" "}
                  </a>
                  {m.ui_your_consent_is_needed_before_this_form_can_be_submitted(
                    {},
                    { locale }
                  )}{" "}
                </FieldDescription>
              </FieldContent>
            </Field>
            <Button
              data-testid="submit-contribution"
              type="submit"
              size="lg"
              className="w-full"
              disabled={status === "submitting" || !consented}
            >
              {status === "submitting" ? (
                <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
              ) : (
                <SendIcon data-icon="inline-start" />
              )}
              {status === "submitting"
                ? m.ui_processing_and_submitting({}, { locale })
                : m.ui_submit_once({}, { locale })}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  )
}
