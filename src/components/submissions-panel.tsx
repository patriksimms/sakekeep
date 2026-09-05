import { projectStateLabel } from "#/domain/project-labels.ts"
import { getLocale } from "#/paraglide/runtime.js"
import * as m from "#/paraglide/messages.js"
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
import { ApiError, projectApi } from "#/lib/api.ts"
import { captureAnalyticsEvent } from "#/lib/analytics.ts"
import { submissionLabel } from "#/domain/submission-label.ts"
import { Input } from "#/components/ui/input.tsx"
import { Textarea } from "#/components/ui/textarea.tsx"

function questionAnswerLabel(question: FormQuestion, answer: SubmissionAnswer | undefined) {
  if (answer === undefined) return m.ui_no_answer()
  if (typeof answer === "string") return answer || m.ui_no_answer()
  if (question.type === "radio" || question.type === "checkboxes") {
    const labels = new Map(question.choices.map((choice) => [choice.id, choice.label]))
    return answer
      .filter((item): item is string => typeof item === "string")
      .map((choice) => labels.get(choice) ?? m.ui_unknown_choice())
      .join(", ")
  }
  return m.image_count({ value0: answer.length })
}

function editHistoryValue(value: string) {
  return value.trim() ? value : m.ui_no_answer()
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
  const [editStart, setEditStart] = useState<{
    submissionId: string
    revision: number
    answers: Record<string, string>
  } | null>(null)
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({})
  const [issues, setIssues] = useState<ValidationIssue[]>([])
  const [confirmingSubmission, setConfirmingSubmission] = useState<SubmissionSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const submissions = project.submissions ?? []
  const textQuestions = project.formSchema.questions.filter(
    (question) => question.type === "single-line" || question.type === "multiline"
  )

  const startEditing = (submission: SubmissionSummary) => {
    const answers = Object.fromEntries(
      textQuestions.map((question) => {
        const answer = submission.answers[question.id]
        return [question.id, typeof answer === "string" ? answer : ""]
      })
    )
    setEditStart({ submissionId: submission.id, revision: submission.revision, answers })
    setDraftAnswers(answers)
    setIssues([])
  }

  const changedAnswers = () =>
    Object.fromEntries(
      textQuestions
        .filter((question) => draftAnswers[question.id] !== editStart?.answers[question.id])
        .map((question) => [question.id, draftAnswers[question.id] ?? ""])
    )

  const reviewChanges = (submission: SubmissionSummary) => {
    const nextIssues = validateEditedTextAnswers(project.formSchema, {
      ...submission.answers,
      ...draftAnswers,
    })
    setIssues(nextIssues)
    if (nextIssues.length > 0) return
    if (Object.keys(changedAnswers()).length === 0) {
      toast.info(m.ui_change_at_least_one_text_answer())
      return
    }
    setConfirmingSubmission(submission)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 data-testid="heading-responses" className="font-heading text-2xl">
            {m.ui_responses()}
          </h2>
          <p className="text-sm text-muted-foreground">
            {m.ui_responses_remain_in_arrival_order_text_answers_can_be_corrected_a()}{" "}
          </p>
        </div>
        <Button data-testid="button-refresh" variant="outline" onClick={onRefresh}>
          <RefreshCwIcon data-icon="inline-start" />
          {m.ui_refresh()}{" "}
        </Button>
      </div>

      {project.state === "draft" ? (
        <Alert>
          <ClockIcon />
          <AlertTitle>{m.ui_publish_when_the_questions_are_ready()}</AlertTitle>
          <AlertDescription>
            {m.ui_the_response_inbox_opens_with_the_public_share_link()}
          </AlertDescription>
        </Alert>
      ) : (
        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle
              data-testid="heading-collection-is-paused-by-the-archive"
              className="flex items-center gap-2"
            >
              {project.archivedAt ? (
                <ArchiveIcon aria-hidden="true" />
              ) : project.state === "collecting" ? (
                <InboxIcon aria-hidden="true" />
              ) : (
                <LockIcon aria-hidden="true" />
              )}
              {project.archivedAt
                ? m.ui_collection_is_paused_by_the_archive()
                : project.state === "collecting"
                  ? m.ui_collection_is_open()
                  : m.ui_collection_is_permanently_closed()}
            </CardTitle>
            <CardDescription>
              {project.archivedAt
                ? m.ui_while_archived_the_share_link_reports_a_closed_collection_unarchi()
                : project.state === "collecting"
                  ? m.ui_new_valid_submissions_are_accepted_through_the_unguessable_link()
                  : m.ui_the_share_link_now_returns_a_closed_state_and_can_never_be_reopen()}
            </CardDescription>
          </CardHeader>
          {project.shareUrl && (
            <CardContent className="flex flex-col gap-3 sm:flex-row">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-sm">
                {project.shareUrl}
              </code>
              <Button
                data-testid="button-copied"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(project.shareUrl!)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1800)
                  toast.success(m.ui_share_link_copied())
                }}
              >
                {copied ? (
                  <CheckIcon data-icon="inline-start" />
                ) : (
                  <CopyIcon data-icon="inline-start" />
                )}
                {copied ? m.ui_copied() : m.ui_copy_link()}
              </Button>
              <Button
                data-testid="button-open-form"
                variant="outline"
                render={<a href={project.shareUrl} target="_blank" rel="noreferrer" />}
              >
                {m.ui_open_form()}{" "}
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-card/80">
          <CardHeader>
            <CardDescription>{m.ui_responses_received()}</CardDescription>
            <CardTitle className="text-4xl">{project.submissionCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-card/80 sm:col-span-2">
          <CardHeader>
            <CardDescription>{m.ui_lifecycle()}</CardDescription>
            <CardTitle className="capitalize">{project.state}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            {(["draft", "collecting", "closed"] as const).map((state) => (
              <Badge
                key={projectStateLabel(state)}
                variant={project.state === state ? "default" : "outline"}
                className="capitalize"
              >
                {projectStateLabel(state)}
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
            <EmptyTitle data-testid="heading-no-responses-yet">
              {m.ui_no_responses_yet()}
            </EmptyTitle>
            <EmptyDescription>
              {m.ui_incoming_responses_will_appear_here_without_exposing_contributor_()}{" "}
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
                    {new Date(submission.submittedAt).toLocaleString(getLocale())}
                    {submission.edits.length > 0 && m.ui_edited()}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <dl className="grid gap-5 pb-3">
                  {project.formSchema.questions.map((question) => {
                    const answer = submission.answers[question.id]
                    const editing = editStart?.submissionId === submission.id
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
                    <h4 className="text-sm font-medium">{m.ui_edit_history()}</h4>
                    <ol className="mt-3 grid gap-4">
                      {[...submission.edits].reverse().map((edit) => (
                        <li key={edit.id} className="border-l-2 pl-3 text-sm">
                          <p>
                            {edit.editorName} ·{" "}
                            {new Date(edit.editedAt).toLocaleString(getLocale())}
                          </p>
                          <dl className="mt-2 grid gap-2 text-muted-foreground">
                            {edit.changes.map((change) => {
                              const question = project.formSchema.questions.find(
                                (candidate) => candidate.id === change.questionId
                              )
                              return (
                                <div key={change.questionId}>
                                  <dt className="font-medium text-foreground">
                                    {question?.prompt ?? m.ui_removed_question()}
                                  </dt>
                                  <dd className="whitespace-pre-wrap">
                                    <span className="line-through">
                                      {editHistoryValue(change.previousValue)}
                                    </span>
                                    <span className="mx-1" aria-hidden="true">
                                      →
                                    </span>
                                    <span>{editHistoryValue(change.newValue)}</span>
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
                    {editStart?.submissionId === submission.id ? (
                      <>
                        <Button
                          data-testid="button-cancel"
                          variant="ghost"
                          onClick={() => {
                            setEditStart(null)
                            setIssues([])
                          }}
                        >
                          {m.ui_cancel()}{" "}
                        </Button>
                        <Button
                          data-testid="button-review-changes"
                          onClick={() => reviewChanges(submission)}
                        >
                          {m.ui_review_changes()}
                        </Button>
                      </>
                    ) : (
                      <Button
                        data-testid="button-edit-response"
                        variant="outline"
                        onClick={() => startEditing(submission)}
                      >
                        <PencilIcon data-icon="inline-start" />
                        {m.ui_edit_response()}{" "}
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
            <AlertDialogTitle data-testid="heading-change-this-submitted-response">
              {m.ui_change_this_submitted_response()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {m.ui_you_are_changing_content_submitted_by_a_contributor_your_changes_()}{" "}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmingSubmission && (
            <ul className="list-disc pl-5 text-sm">
              {Object.keys(changedAnswers()).map((questionId) => (
                <li key={questionId}>
                  {project.formSchema.questions.find((question) => question.id === questionId)
                    ?.prompt ?? m.ui_removed_question()}
                </li>
              ))}
            </ul>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-keep-editing" disabled={saving}>
              {m.ui_keep_editing()}
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-save-changes"
              variant="destructive"
              disabled={saving}
              onClick={async () => {
                if (!confirmingSubmission || !editStart) return
                const answers = changedAnswers()
                setSaving(true)
                try {
                  const updated = await projectApi.updateSubmission(
                    project.id,
                    editStart.submissionId,
                    {
                      expectedRevision: editStart.revision,
                      answers,
                    }
                  )
                  onProjectChange(updated)
                  captureAnalyticsEvent("responses:edit_saved", {
                    changed_answer_count: Object.keys(answers).length,
                    previous_edit_count: confirmingSubmission.edits.length,
                  })
                  setEditStart(null)
                  setConfirmingSubmission(null)
                  setIssues([])
                  toast.success(m.ui_response_updated())
                } catch (error) {
                  setConfirmingSubmission(null)
                  if (error instanceof ApiError && error.status === 409) setEditStart(null)
                  toast.error(
                    error instanceof Error ? error.message : m.ui_response_update_failed()
                  )
                } finally {
                  setSaving(false)
                }
              }}
            >
              {saving && <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />}
              {m.ui_save_changes()}{" "}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {project.state === "collecting" && !project.archivedAt && (
        <div className="flex flex-col items-end gap-1.5">
          <AlertDialog>
            <AlertDialogTrigger
              data-testid="button-lock-collection"
              render={<Button variant="outline" />}
            >
              <LockIcon data-icon="inline-start" />
              {m.ui_lock_collection()}{" "}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle data-testid="heading-lock-collection-permanently">
                  {m.ui_lock_collection_permanently()}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {m.ui_new_submissions_will_be_rejected_immediately_including_any_contri()}{" "}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-keep-collecting">
                  {m.ui_keep_collecting()}
                </AlertDialogCancel>
                <AlertDialogAction
                  data-testid="button-lock-collection"
                  onClick={async () => {
                    try {
                      const updated = await projectApi.action(project.id, "close")
                      onProjectChange(updated)
                      toast.success(m.ui_collection_locked_permanently())
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : m.ui_lock_failed())
                    }
                  }}
                >
                  {m.ui_lock_collection()}{" "}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <p className="text-xs text-muted-foreground">{m.ui_stops_new_responses_permanently()}</p>
        </div>
      )}
    </div>
  )
}
