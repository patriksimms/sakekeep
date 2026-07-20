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
import { validateFormForPublish } from "#/domain/form.ts"
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "#/components/ui/field.tsx"
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
import { projectApi } from "#/lib/api.ts"

type SaveState = "saved" | "unsaved" | "saving" | "failed"

const typeLabels: Record<QuestionType, string> = {
  "single-line": "Single-line text",
  multiline: "Multiline text",
  radio: "Radio buttons",
  checkboxes: "Checkboxes",
  images: "Image upload",
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
      { id: crypto.randomUUID(), label: "Option 1" },
      { id: crypto.randomUUID(), label: "Option 2" },
    ],
  }
}

function SaveIndicator({ state }: { state: SaveState }) {
  const content = {
    saved: { icon: CheckIcon, label: "Saved" },
    unsaved: { icon: SaveIcon, label: "Unsaved changes" },
    saving: { icon: LoaderCircleIcon, label: "Saving…" },
    failed: { icon: XCircleIcon, label: "Save failed" },
  }[state]
  return (
    <span role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <content.icon
        aria-hidden="true"
        className={state === "saving" ? "animate-spin" : undefined}
      />
      {content.label}
    </span>
  )
}

interface QuestionEditorProps {
  question: FormQuestion
  index: number
  count: number
  onChange: (question: FormQuestion) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}

function QuestionEditor({
  question,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: QuestionEditorProps) {
  const update = <T extends FormQuestion>(changes: Partial<T>) =>
    onChange({ ...question, ...changes } as FormQuestion)

  return (
    <Card className="bg-card/90" data-testid="question-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-muted font-sans text-xs">
            {index + 1}
          </span>
          {question.prompt || "Untitled question"}
        </CardTitle>
        <CardDescription>{typeLabels[question.type]}</CardDescription>
        <CardAction className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Move question up"
          >
            <ArrowUpIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            aria-label="Move question down"
          >
            <ArrowDownIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            aria-label="Delete question"
          >
            <Trash2Icon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`prompt-${question.id}`}>Question</FieldLabel>
            <Textarea
              id={`prompt-${question.id}`}
              value={question.prompt}
              onChange={(event) => update({ prompt: event.target.value })}
              placeholder="What will you always remember about us?"
              rows={2}
              maxLength={500}
              aria-invalid={!question.prompt.trim()}
            />
          </Field>
          <Field orientation="horizontal">
            <Switch
              id={`required-${question.id}`}
              checked={question.required}
              onCheckedChange={(checked) => update({ required: checked === true })}
            />
            <FieldLabel htmlFor={`required-${question.id}`}>Required answer</FieldLabel>
          </Field>

          {(question.type === "single-line" || question.type === "multiline") && (
            <Field>
              <FieldLabel htmlFor={`limit-${question.id}`}>
                Character limit <span className="text-muted-foreground">(optional)</span>
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
                Positive values are enforced in the browser and on the server.
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
                Validate as an HTTP or HTTPS URL
              </FieldLabel>
            </Field>
          )}

          {(question.type === "radio" || question.type === "checkboxes") && (
            <Field>
              <FieldLabel>Ordered choices</FieldLabel>
              <div className="flex flex-col gap-2">
                {question.choices.map((choice, choiceIndex) => (
                  <div key={choice.id} className="flex items-center gap-2">
                    <Input
                      value={choice.label}
                      aria-label={`Choice ${choiceIndex + 1}`}
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
                      aria-label={`Move choice ${choiceIndex + 1} up`}
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
                      aria-label={`Move choice ${choiceIndex + 1} down`}
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
                      aria-label={`Delete choice ${choiceIndex + 1}`}
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
                ))}
              </div>
              <Button
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
                        label: `Option ${question.choices.length + 1}`,
                      },
                    ],
                  })
                }
              >
                <PlusIcon data-icon="inline-start" />
                Add choice
              </Button>
            </Field>
          )}

          {question.type === "images" && (
            <Field>
              <FieldLabel htmlFor={`max-images-${question.id}`}>Maximum images</FieldLabel>
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
                JPEG, PNG, WebP, HEIF, and HEIC. Up to 15 MB per source image.
              </FieldDescription>
            </Field>
          )}
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-between text-xs text-muted-foreground">
        <span>Question ID: {question.id.slice(0, 8)}</span>
        {question.required && <Badge variant="outline">Required</Badge>}
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
      onProjectChange(updated)
      if (savedVersion.current === editVersion.current) {
        setSaveState("saved")
      } else {
        setSaveState("unsaved")
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => void save(), 400)
      }
    } catch (error) {
      setSaveState("failed")
      toast.error(error instanceof Error ? error.message : "Autosave failed")
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
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), 700)
  }

  const issues = useMemo(() => validateFormForPublish(form), [form])

  if (project.state !== "draft") {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading text-2xl">Published form</h2>
            <p className="text-sm text-muted-foreground">This revision is permanently frozen.</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="outline" />}>
              <CopyIcon data-icon="inline-start" />
              Duplicate as draft
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Duplicate this project?</AlertDialogTitle>
                <AlertDialogDescription>
                  The new draft copies the form and layouts, but never the share token or responses.
                  This project remains unchanged.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    try {
                      const duplicate = await projectApi.action(project.id, "duplicate")
                      window.location.assign(`/projects/${duplicate.id}`)
                    } catch (error) {
                      toast.error(
                        error instanceof Error ? error.message : "Could not duplicate project"
                      )
                    }
                  }}
                >
                  Create draft copy
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <div className="grid gap-4">
          {form.questions.map((question, index) => (
            <Card key={question.id} className="bg-card/80">
              <CardHeader>
                <CardTitle>
                  {index + 1}. {question.prompt}
                </CardTitle>
                <CardDescription>
                  {typeLabels[question.type]} · {question.required ? "Required" : "Optional"}
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
          <h2 className="font-heading text-2xl">Build the questionnaire</h2>
          <p className="text-sm text-muted-foreground">
            Changes autosave with revision checks. Publishing freezes this form forever.
          </p>
        </div>
        <SaveIndicator state={saveState} />
      </div>

      <Card className="bg-card/80">
        <CardHeader>
          <CardTitle>Add a question</CardTitle>
          <CardDescription>
            Every documented answer type can be mixed and reordered.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Select value={addType} onValueChange={(value) => setAddType(value as QuestionType)}>
            <SelectTrigger className="w-full sm:w-64" aria-label="Question type to add">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(typeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
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
            Add {typeLabels[addType].toLowerCase()}
          </Button>
        </CardContent>
      </Card>

      {form.questions.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-heading text-lg">The first page is still blank.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add at least one valid question before publishing.
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

      {issues.length > 0 && (
        <Card className="bg-card/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangleIcon aria-hidden="true" />
              Before you publish
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
              {issues.map((issue, index) => (
                <li key={`${issue.path}-${index}`}>{issue.message}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <AlertDialog>
          <AlertDialogTrigger
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
            Publish and create share link
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Publish this form permanently?</AlertDialogTitle>
              <AlertDialogDescription>
                Publishing creates an unguessable public link and freezes this exact form revision.
                You can duplicate the project later, but you cannot edit the published form.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  try {
                    const updated = await projectApi.action(project.id, "publish")
                    onProjectChange(updated)
                    toast.success("Form published")
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Publish failed")
                  }
                }}
              >
                Publish forever
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
