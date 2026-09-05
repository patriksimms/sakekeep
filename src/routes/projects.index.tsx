import { captureAnalyticsEvent } from "#/lib/analytics.ts"
import { getLocale } from "#/paraglide/runtime.js"
import { isLocale } from "#/lib/locale.ts"
import * as m from "#/paraglide/messages.js"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import {
  ArchiveIcon,
  ArrowRightIcon,
  BookHeartIcon,
  FolderPlusIcon,
  LoaderCircleIcon,
  PlusIcon,
} from "lucide-react"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Badge } from "#/components/ui/badge.tsx"
import { Button, buttonVariants } from "#/components/ui/button.tsx"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog.tsx"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty.tsx"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "#/components/ui/field.tsx"
import { Input } from "#/components/ui/input.tsx"
import { Skeleton } from "#/components/ui/skeleton.tsx"
import { projectApi } from "#/lib/api.ts"

export const Route = createFileRoute("/projects/")({
  component: ProjectsPage,
})

function statusLabel(state: "draft" | "collecting" | "closed") {
  if (state === "collecting") return m.ui_collecting()
  if (state === "closed") return m.ui_closed()
  return m.ui_draft()
}

function NewProjectDialog() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [bookLanguage, setBookLanguage] = useState(getLocale)
  const [occasion, setOccasion] = useState("")
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const create = useMutation({
    mutationFn: projectApi.create,
    onSuccess: async (project) => {
      captureAnalyticsEvent("project:created", {
        book_language: project.bookLanguage,
        ui_locale: getLocale(),
      })
      await queryClient.invalidateQueries({ queryKey: ["projects"] })
      setOpen(false)
      toast.success(m.ui_project_created())
      await navigate({
        to: "/projects/$projectId",
        params: { projectId: project.id },
      })
    },
    onError: (error) => toast.error(error.message),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    create.mutate({ title, occasion: occasion || null, bookLanguage })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger data-testid="button-new-project" render={<Button />}>
        <PlusIcon data-icon="inline-start" />
        {m.ui_new_project()}{" "}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle data-testid="heading-create-a-friend-book">
              {m.ui_create_a_friend_book()}
            </DialogTitle>
            <DialogDescription>
              {m.ui_start_with_a_name_and_optional_occasion_you_can_refine_the_form_b()}{" "}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="project-title">{m.ui_project_name()}</FieldLabel>
              <Input
                id="project-title"
                data-testid="project-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={m.ui_lea_s_farewell_book()}
                maxLength={200}
                required
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="project-occasion">
                {m.ui_occasion()} <span className="text-muted-foreground">{m.ui_optional()}</span>
              </FieldLabel>
              <Input
                id="project-occasion"
                data-testid="project-occasion"
                value={occasion}
                onChange={(event) => setOccasion(event.target.value)}
                placeholder={m.ui_farewell_september_2026()}
                maxLength={200}
              />
              <FieldDescription>
                {m.ui_this_helps_you_distinguish_projects_locally()}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="book-language">{m.book_language()}</FieldLabel>
              <Select
                value={bookLanguage}
                onValueChange={(value) => {
                  if (isLocale(value)) setBookLanguage(value)
                }}
                items={[
                  { value: "de", label: "Deutsch" },
                  { value: "en", label: "English" },
                ]}
              >
                <SelectTrigger id="book-language" data-testid="book-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="de">Deutsch</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              data-testid="button-create-project"
              type="submit"
              disabled={create.isPending || !title.trim()}
            >
              {create.isPending && (
                <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
              )}
              {m.ui_create_project()}{" "}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ProjectsPage() {
  const [showArchived, setShowArchived] = useState(false)
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: projectApi.list,
  })
  const allProjects = projects.data?.projects ?? []
  const archivedCount = allProjects.filter((project) => project.archivedAt).length
  const projectList = showArchived
    ? allProjects
    : allProjects.filter((project) => !project.archivedAt)

  return (
    <main id="main-content" className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="mb-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="flex max-w-2xl flex-col gap-2">
          <p className="text-sm font-semibold tracking-[0.16em] text-primary uppercase">
            {m.ui_organizer_workspace()}{" "}
          </p>
          <h1
            data-testid="heading-your-projects"
            className="font-heading text-4xl tracking-tight sm:text-5xl"
          >
            {m.ui_your_projects()}
          </h1>
          <p className="text-muted-foreground">
            {m.ui_everything_here_is_stored_in_your_local_postgresql_and_rustfs_ser()}{" "}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {archivedCount > 0 && (
            <Button
              data-testid="button-hide-archived"
              variant="outline"
              onClick={() => setShowArchived((current) => !current)}
            >
              <ArchiveIcon data-icon="inline-start" />
              {showArchived ? m.ui_hide_archived() : m.show_archived({ value0: archivedCount })}
            </Button>
          )}
          <NewProjectDialog />
        </div>
      </div>

      {projects.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : projects.isError ? (
        <Empty className="min-h-80 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookHeartIcon />
            </EmptyMedia>
            <EmptyTitle data-testid="heading-local-services-are-not-ready">
              {m.ui_local_services_are_not_ready()}
            </EmptyTitle>
            <EmptyDescription>
              {projects.error.message} {m.ui_run()} <code>bun run setup</code>
              {m.ui_then_retry()}{" "}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button data-testid="button-retry" variant="outline" onClick={() => projects.refetch()}>
              {m.ui_retry()}{" "}
            </Button>
          </EmptyContent>
        </Empty>
      ) : projectList.length === 0 ? (
        <Empty className="min-h-80 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderPlusIcon />
            </EmptyMedia>
            <EmptyTitle data-testid="heading-no-keepsakes-yet">
              {m.ui_no_keepsakes_yet()}
            </EmptyTitle>
            <EmptyDescription>
              {m.ui_create_a_draft_project_shape_its_questions_then_publish_a_share_l()}{" "}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <NewProjectDialog />
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projectList.map((project) => (
            <Link
              key={project.id}
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              aria-label={m.open_project_workspace({ value0: project.title })}
              className="group/project-card rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Card
                className={
                  project.archivedAt
                    ? "min-h-56 bg-card/60 transition-colors group-hover/project-card:bg-muted/50"
                    : "min-h-56 bg-card/90 transition-colors group-hover/project-card:bg-muted/50"
                }
              >
                <CardHeader>
                  <CardTitle className="text-xl">{project.title}</CardTitle>
                  <CardDescription>{project.occasion || m.ui_no_occasion_added()}</CardDescription>
                  <CardAction className="flex items-center gap-2">
                    {project.archivedAt && (
                      <Badge variant="outline">
                        <ArchiveIcon data-icon="inline-start" />
                        {m.ui_archived()}{" "}
                      </Badge>
                    )}
                    <Badge
                      variant={
                        project.state === "collecting" && !project.archivedAt
                          ? "default"
                          : "secondary"
                      }
                    >
                      {statusLabel(project.state)}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="mt-auto grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-2xl font-semibold">{project.submissionCount}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.ui_responses_528({ count: project.submissionCount })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {project.bookStatus === "not-generated"
                        ? m.book_not_generated()
                        : project.bookStatus === "current"
                          ? m.book_current()
                          : m.book_stale()}
                    </p>
                    <p className="text-xs text-muted-foreground">{m.ui_book_status()}</p>
                  </div>
                </CardContent>
                <CardFooter>
                  <span
                    className={buttonVariants({
                      variant: "ghost",
                      className: "ml-auto",
                    })}
                  >
                    {m.ui_open_workspace()} <ArrowRightIcon data-icon="inline-end" />
                  </span>
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
