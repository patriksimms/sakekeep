import {
  CheckIcon,
  ClockIcon,
  CopyIcon,
  ImageIcon,
  InboxIcon,
  LockIcon,
  RefreshCwIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  type FormQuestion,
  type ImageAnswer,
  type Project,
  type SubmissionAnswer,
} from "#/domain/types.ts"
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
  const submissions = project.submissions ?? []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-heading text-2xl">Responses</h2>
          <p className="text-sm text-muted-foreground">
            Anonymous submissions are read-only and remain in arrival order.
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
              {project.state === "collecting" ? (
                <InboxIcon aria-hidden="true" />
              ) : (
                <LockIcon aria-hidden="true" />
              )}
              {project.state === "collecting"
                ? "Collection is open"
                : "Collection is permanently closed"}
            </CardTitle>
            <CardDescription>
              {project.state === "collecting"
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
                  <span className="font-medium">Response {submission.sequence}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(submission.submittedAt).toLocaleString()}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <dl className="grid gap-5 pb-3">
                  {project.formSchema.questions.map((question) => {
                    const answer = submission.answers[question.id]
                    return (
                      <div key={question.id}>
                        <dt className="text-sm font-medium">{question.prompt}</dt>
                        <dd className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                          {question.type === "images" ? (
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
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {project.state === "collecting" && (
        <div className="flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="destructive" />}>
              <LockIcon data-icon="inline-start" />
              Close collection permanently
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Close collection forever?</AlertDialogTitle>
                <AlertDialogDescription>
                  New submissions will be rejected immediately, including any contributor currently
                  filling the form. Existing responses remain read-only. This transition cannot be
                  reversed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep collecting</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={async () => {
                    try {
                      const updated = await projectApi.action(project.id, "close")
                      onProjectChange(updated)
                      toast.success("Collection closed permanently")
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Close failed")
                    }
                  }}
                >
                  Close permanently
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  )
}
