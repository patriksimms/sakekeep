import {
  ArchiveIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  ImageIcon,
  InboxIcon,
  LoaderCircleIcon,
  LockIcon,
  PencilIcon,
  RefreshCwIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  type FormQuestion,
  type ImageAnswer,
  type Project,
  type SubmissionAnswer,
  type SubmissionSummary,
} from "#/domain/types.ts"
import { validateEditedTextAnswers, type ValidationIssue } from "#/domain/form.ts"
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
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx"
import { Badge } from "#/components/ui/badge.tsx"
import { Button } from "#/components/ui/button.tsx"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card.tsx"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty.tsx"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "#/components/ui/accordion.tsx"
import { projectApi } from "#/lib/api.ts"
import { captureAnalyticsEvent } from "#/lib/analytics.ts"
import { submissionLabel } from "#/domain/submission-label.ts"
import { Input } from "#/components/ui/input.tsx"
import { Textarea } from "#/components/ui/textarea.tsx"

function questionAnswerLabel(question: FormQuestion, answer: SubmissionAnswer | undefined) {
  if (answer === undefined) return "No answer"
  if (typeof answer === "string") return answer || "No answer"
  if (question.type === "radio" || question.type === "checkboxes") {
    const labels = new Map(question.choices.map((choice) => [choice.id, choice.label]))
    return answer
      .filter((item): item is string => typeof item === "string")
      .map((choice) => labels.get(choice) ?? "Unknown choice")
      .join(", ")
  }
  return `${answer.length} image${answer.length === 1 ? "" : "s"}`
}

function Images({ answer }: { answer: SubmissionAnswer | undefined }) {
  if (!Array.isArray(answer)) return null
  const images = answer.filter(
    (item): item is ImageAnswer => typeof item === "object" && item !== null && "assetId" in item
  )
  if (images.length === 0) return null
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {images.map((image) => (
        <a
          key={image.assetId}
          href={image.masterUrl}
          target="_blank"
          rel="noreferrer"
          className="group relative aspect-square overflow-hidden rounded-lg bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <img
            src={image.previewUrl}
            alt={image.name}
            className="size-full object-cover transition-transform group-hover:scale-105"
          />
          <span className="absolute right-1 bottom-1 left-1 truncate rounded bg-background/85 px-1.5 py-1 text-xs">
            {image.name}
          </span>
        </a>
      ))}
    </div>
  )
}

export function SubmissionsPanel({
  project,
  onProjectChange,
  onRefresh,
}: {
  project: Project
  onProjectChange: (project: Project) => void
  onRefresh: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null)
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({})
  const [issues, setIssues] = useState<ValidationIssue[]>([])
  const [confirmingSubmission, setConfirmingSubmission] = useState<SubmissionSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const submissions = project.submissions ?? []
  const textQuestions = project.formSchema.questions.filter(
    (question) => question.type === "single-line" || question.type === "multiline"
  )

  const startEditing = (submission: SubmissionSummary) => {
    setEditingSubmissionId(submission.id)
    setDraftAnswers(
      Object.fromEntries(
        textQuestions.map((question) => {
          const answer = submission.answers[question.id]
          return [question.id, typeof answer === "string" ? answer : ""]
        })
      )
    )
    setIssues([])
  }

  const changedAnswers = (submission: SubmissionSummary) =>
    Object.fromEntries(
      textQuestions
        .filter((question) => {
          const answer = submission.answers[question.id]
          return draftAnswers[question.id] !== (typeof answer === "string" ? answer : "")
        })
        .map((question) => [question.id, draftAnswers[question.id] ?? ""])
    )

  const reviewChanges = (submission: SubmissionSummary) => {
    const nextIssues = validateEditedTextAnswers(project.formSchema, {
      ...submission.answers,
      ...draftAnswers,
    })
    setIssues(nextIssues)
    if (nextIssues.length > 0) return
    if (Object.keys(changedAnswers(submission)).length === 0) {
      toast.info("Change at least one text answer")
      return
    }
    setConfirmingSubmission(submission)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-heading text-2xl">Responses</h2>
          <p className="text-sm text-muted-foreground">
            Responses remain in arrival order. Text answers can be corrected after collection
            closes.
          </p>
        </div>
        <Button variant="outline" onClick={onRefresh}>
          <RefreshCwIcon data-icon="inline-start" />
          Refresh
        </Button>
      </div>

      {project.state === "draft" ? (
        <Alert>
          <ClockIcon />
          <AlertTitle>Publish when the questions are ready</AlertTitle>
          <AlertDescription>The response inbox opens with the public share link.</AlertDescription>
        </Alert>
      ) : (
        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {project.archivedAt ? (
                <ArchiveIcon aria-hidden="true" />
              ) : project.state === "collecting" ? (
                <InboxIcon aria-hidden="true" />
              ) : (
                <LockIcon aria-hidden="true" />
              )}
              {project.archivedAt
                ? "Collection is paused by the archive"
                : project.state === "collecting"
                  ? "Collection is open"
                  : "Collection is permanently closed"}
            </CardTitle>
            <CardDescription>
              {project.archivedAt
                ? "While archived, the share link reports a closed collection. Unarchive the project to reopen it in its current state."
                : project.state === "collecting"
                  ? "New valid submissions are accepted through the unguessable link."
                  : "The share link now returns a closed state and can never be reopened."}
            </CardDescription>
          </CardHeader>
          {project.shareUrl && (
            <CardContent className="flex flex-col gap-3 sm:flex-row">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-sm">
                {project.shareUrl}
              </code>
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(project.shareUrl!)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1800)
                  toast.success("Share link copied")
                }}
              >
                {copied ? (
                  <CheckIcon data-icon="inline-start" />
                ) : (
                  <CopyIcon data-icon="inline-start" />
                )}
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button
                variant="outline"
                render={<a href={project.shareUrl} target="_blank" rel="noreferrer" />}
              >
                Open form
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-card/80">
          <CardHeader>
            <CardDescription>Responses received</CardDescription>
            <CardTitle className="text-4xl">{project.submissionCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-card/80 sm:col-span-2">
          <CardHeader>
            <CardDescription>Lifecycle</CardDescription>
            <CardTitle className="capitalize">{project.state}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            {(["draft", "collecting", "closed"] as const).map((state) => (
              <Badge
                key={state}
                variant={project.state === state ? "default" : "outline"}
                className="capitalize"
              >
                {state}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>

      {submissions.length === 0 ? (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>No responses yet</EmptyTitle>
            <EmptyDescription>
              Incoming responses will appear here without exposing contributor identity.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Accordion className="rounded-xl border bg-card/80 px-4">
          {submissions.map((submission) => (
            <AccordionItem
              key={submission.id}
              value={submission.id}
              className="border-b last:border-b-0"
            >
              <AccordionTrigger>
                <span className="flex flex-1 items-center justify-between gap-4 pr-3 text-left">
                  <span className="font-medium">
                    {submissionLabel(project.formSchema, submission)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(submission.submittedAt).toLocaleString()}
                    {submission.edits.length > 0 && " · Edited"}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <dl className="grid gap-5 pb-3">
                  {project.formSchema.questions.map((question) => {
                    const answer = submission.answers[question.id]
                    const editing = editingSubmissionId === submission.id
                    const editable =
                      question.type === "single-line" || question.type === "multiline"
                    const questionIssues = issues.filter(
                      (issue) => issue.path === `answers.${question.id}`
                    )
                    const errorId = `${submission.id}-${question.id}-error`
                    return (
                      <div key={question.id}>
                        <dt className="text-sm font-medium">
                          {editing && editable ? (
                            <label htmlFor={`${submission.id}-${question.id}`}>
                              {question.prompt}
                            </label>
                          ) : (
                            question.prompt
                          )}
                        </dt>
                        <dd className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                          {editing && editable ? (
                            <div className="max-w-2xl">
                              {question.type === "multiline" ? (
                                <Textarea
                                  id={`${submission.id}-${question.id}`}
                                  value={draftAnswers[question.id] ?? ""}
                                  maxLength={question.characterLimit}
                                  aria-invalid={questionIssues.length > 0}
                                  aria-describedby={questionIssues.length > 0 ? errorId : undefined}
                                  onChange={(event) => {
                                    setDraftAnswers((current) => ({
                                      ...current,
                                      [question.id]: event.target.value,
                                    }))
                                    setIssues((current) =>
                                      current.filter(
                                        (issue) => issue.path !== `answers.${question.id}`
                                      )
                                    )
                                  }}
                                />
                              ) : (
                                <Input
                                  id={`${submission.id}-${question.id}`}
                                  value={draftAnswers[question.id] ?? ""}
                                  maxLength={question.characterLimit}
                                  aria-invalid={questionIssues.length > 0}
                                  aria-describedby={questionIssues.length > 0 ? errorId : undefined}
                                  onChange={(event) => {
                                    setDraftAnswers((current) => ({
                                      ...current,
                                      [question.id]: event.target.value,
                                    }))
                                    setIssues((current) =>
                                      current.filter(
                                        (issue) => issue.path !== `answers.${question.id}`
                                      )
                                    )
                                  }}
                                />
                              )}
                              {questionIssues.length > 0 && (
                                <div id={errorId} className="mt-1 text-destructive">
                                  {questionIssues.map((issue) => (
                                    <p key={issue.message}>{issue.message}</p>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : question.type === "images" ? (
                            <>
                              <span className="flex items-center gap-1">
                                <ImageIcon aria-hidden="true" />
                                {questionAnswerLabel(question, answer)}
                              </span>
                              <Images answer={answer} />
                            </>
                          ) : (
                            questionAnswerLabel(question, answer)
                          )}
                        </dd>
                      </div>
                    )
                  })}
                </dl>
                {submission.edits.length > 0 && (
                  <div className="border-t py-4">
                    <h4 className="text-sm font-medium">Edit history</h4>
                    <ol className="mt-3 grid gap-4">
                      {[...submission.edits].reverse().map((edit) => (
                        <li key={edit.id} className="border-l-2 pl-3 text-sm">
                          <p>
                            {edit.editorName} · {new Date(edit.editedAt).toLocaleString()}
                          </p>
                          <dl className="mt-2 grid gap-2 text-muted-foreground">
                            {edit.changes.map((change) => {
                              const question = project.formSchema.questions.find(
                                (candidate) => candidate.id === change.questionId
                              )
                              return (
                                <div key={change.questionId}>
                                  <dt className="font-medium text-foreground">
                                    {question?.prompt ?? "Removed question"}
                                  </dt>
                                  <dd className="whitespace-pre-wrap">
                                    <span className="line-through">{change.previousValue}</span>
                                    <span className="mx-1" aria-hidden="true">
                                      →
                                    </span>
                                    <span>{change.newValue}</span>
                                  </dd>
                                </div>
                              )
                            })}
                          </dl>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {project.state === "closed" && !project.archivedAt && textQuestions.length > 0 && (
                  <div className="flex justify-end gap-2 border-t pt-3">
                    {editingSubmissionId === submission.id ? (
                      <>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setEditingSubmissionId(null)
                            setIssues([])
                          }}
                        >
                          Cancel
                        </Button>
                        <Button onClick={() => reviewChanges(submission)}>Review changes</Button>
                      </>
                    ) : (
                      <Button variant="outline" onClick={() => startEditing(submission)}>
                        <PencilIcon data-icon="inline-start" />
                        Edit response
                      </Button>
                    )}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      <AlertDialog
        open={Boolean(confirmingSubmission)}
        onOpenChange={(open) => {
          if (!open && !saving) setConfirmingSubmission(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change this submitted response?</AlertDialogTitle>
            <AlertDialogDescription>
              You are changing content submitted by a contributor. Your changes and the original
              answers will remain visible in the edit history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmingSubmission && (
            <ul className="list-disc pl-5 text-sm">
              {Object.keys(changedAnswers(confirmingSubmission)).map((questionId) => (
                <li key={questionId}>
                  {project.formSchema.questions.find((question) => question.id === questionId)
                    ?.prompt ?? "Removed question"}
                </li>
              ))}
            </ul>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={saving}
              onClick={async () => {
                if (!confirmingSubmission) return
                const answers = changedAnswers(confirmingSubmission)
                setSaving(true)
                try {
                  const updated = await projectApi.updateSubmission(
                    project.id,
                    confirmingSubmission.id,
                    {
                      expectedRevision: confirmingSubmission.revision,
                      answers,
                    }
                  )
                  onProjectChange(updated)
                  captureAnalyticsEvent("responses:edit_saved", {
                    changed_answer_count: Object.keys(answers).length,
                    previous_edit_count: confirmingSubmission.edits.length,
                  })
                  setEditingSubmissionId(null)
                  setConfirmingSubmission(null)
                  setIssues([])
                  toast.success("Response updated")
                } catch (error) {
                  setConfirmingSubmission(null)
                  toast.error(error instanceof Error ? error.message : "Response update failed")
                } finally {
                  setSaving(false)
                }
              }}
            >
              {saving && <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />}
              Save changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {project.state === "collecting" && !project.archivedAt && (
        <div className="flex flex-col items-end gap-1.5">
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="outline" />}>
              <LockIcon data-icon="inline-start" />
              Lock collection
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Lock collection permanently?</AlertDialogTitle>
                <AlertDialogDescription>
                  New submissions will be rejected immediately, including any contributor currently
                  filling the form. Organizers can correct text answers after closing. This
                  transition cannot be reversed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep collecting</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    try {
                      const updated = await projectApi.action(project.id, "close")
                      onProjectChange(updated)
                      toast.success("Collection locked permanently")
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Lock failed")
                    }
                  }}
                >
                  Lock collection
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <p className="text-xs text-muted-foreground">Stops new responses permanently</p>
        </div>
      )}
    </div>
  )
}
