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
import { emptyAnswerForQuestion, validateSubmission, type ValidationIssue } from "#/domain/form.ts"
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

function FilePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
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
        aria-label={`Remove ${file.name}`}
      >
        <Trash2Icon />
      </Button>
    </li>
  )
}

function QuestionField({
  question,
  answer,
  files,
  issue,
  onAnswer,
  onFiles,
}: {
  question: FormQuestion
  answer: SubmissionAnswers[string]
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
      <Field data-invalid={issue ? true : undefined}>
        <FieldLabel htmlFor={fieldId}>
          {question.prompt} {question.required && <span aria-hidden="true">*</span>}
        </FieldLabel>
        <label
          htmlFor={fieldId}
          className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/40 p-5 text-center hover:bg-muted focus-within:ring-3 focus-within:ring-ring/50"
        >
          <ImagePlusIcon aria-hidden="true" />
          <span className="text-sm font-medium">
            Choose up to {question.maxImages} image
            {question.maxImages === 1 ? "" : "s"}
          </span>
          <span className="text-xs text-muted-foreground">
            JPEG, PNG, WebP, HEIF, or HEIC · 15 MB each
          </span>
          <input
            id={fieldId}
            className="sr-only"
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.heif,.heic,image/jpeg,image/png,image/webp,image/heif,image/heic"
            multiple={question.maxImages > 1}
            aria-invalid={issue ? true : undefined}
            onChange={(event) => {
              const selected = Array.from(event.target.files ?? [])
              onFiles([...files, ...selected].slice(0, question.maxImages))
              event.target.value = ""
            }}
          />
        </label>
        {files.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {files.map((file, index) => (
              <FilePreview
                key={`${file.name}-${file.lastModified}-${index}`}
                file={file}
                onRemove={() =>
                  onFiles(files.filter((_candidate, itemIndex) => itemIndex !== index))
                }
              />
            ))}
          </ul>
        )}
        <FieldError>{issue}</FieldError>
      </Field>
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
          {value.length} / {question.characterLimit} characters
        </FieldDescription>
      )}
      <FieldError>{issue}</FieldError>
    </Field>
  )
}

export function PublicForm({ token, title, formSchema }: PublicFormProps) {
  const [answers, setAnswers] = useState(() => initialAnswers(formSchema))
  const [files, setFiles] = useState<Record<string, File[]>>({})
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID())
  const [loaded, setLoaded] = useState(false)
  const [recovered, setRecovered] = useState(false)
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
    const descriptors = Object.entries(files).flatMap(([questionId, values]) =>
      values.map((file, index) => ({
        questionId,
        index,
        name: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      }))
    )
    const validation = validateSubmission(formSchema, answers, descriptors)
    setIssues(validation)
    if (validation.length > 0) {
      setStatus("error")
      setMessage("Review the highlighted answers before submitting.")
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
      if (!response.ok) throw new Error(payload.error ?? "Submission failed.")
      await clearContributorDraft(token)
      setStatus("success")
      setMessage(payload.message ?? "Your response was submitted.")
    } catch (error) {
      setStatus("error")
      setMessage(error instanceof Error ? error.message : "The response could not be submitted.")
    }
  }

  if (!loaded) {
    return (
      <div className="flex min-h-80 items-center justify-center">
        <LoaderCircleIcon className="animate-spin" aria-label="Restoring draft" />
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
          <CardTitle className="text-3xl">Thank you.</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p>{message}</p>
          <p className="text-sm text-muted-foreground">
            Your saved browser draft and local image copies have been cleared. Responses cannot be
            edited after submission.
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
            An anonymous contribution
          </p>
          <h1 className="mt-2 font-heading text-4xl tracking-tight sm:text-5xl">{title}</h1>
        </div>
        <p className="mx-auto max-w-lg text-muted-foreground">
          No account is needed. Your answers stay editable on this device until you submit them
          once.
        </p>
      </div>

      {recovered && (
        <Alert className="mb-5">
          <RefreshCwIcon />
          <AlertTitle>Draft restored</AlertTitle>
          <AlertDescription>
            Your answers and selected local images were recovered from this browser.
          </AlertDescription>
        </Alert>
      )}

      <Progress
        value={(answeredCount / formSchema.questions.length) * 100}
        className="mb-5 rounded-xl border bg-card/80 p-3"
      >
        <ProgressLabel>Your progress</ProgressLabel>
        <ProgressValue>{() => `${answeredCount} of ${formSchema.questions.length}`}</ProgressValue>
      </Progress>

      <form onSubmit={submit}>
        <Card className="bg-card/95">
          <CardContent>
            <FieldGroup>
              {formSchema.questions.map((question) => (
                <QuestionField
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
                <AlertTitle>Could not submit</AlertTitle>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={status === "submitting"}>
              {status === "submitting" ? (
                <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
              ) : (
                <SendIcon data-icon="inline-start" />
              )}
              {status === "submitting" ? "Processing and submitting…" : "Submit once"}
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Image files are stored in IndexedDB for draft recovery, never in localStorage.
            </p>
          </div>
        </Card>
      </form>
    </div>
  )
}
