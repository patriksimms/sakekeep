import { projectStateLabel, bookStatusLabel } from "#/domain/project-labels.ts"
import { getLocale } from "#/paraglide/runtime.js"
import * as m from "#/paraglide/messages.js"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  BookOpenIcon,
  FileQuestionIcon,
  FileOutputIcon,
  InboxIcon,
  LayoutTemplateIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { BookReview } from "#/components/book-review.tsx"
import { ExportPanel } from "#/components/export-panel.tsx"
import { FormBuilder } from "#/components/form-builder.tsx"
import { LayoutsPanel } from "#/components/layout-editor.tsx"
import { SubmissionsPanel } from "#/components/submissions-panel.tsx"
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
import { Button, buttonVariants } from "#/components/ui/button.tsx"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty.tsx"
import { Input } from "#/components/ui/input.tsx"
import { Skeleton } from "#/components/ui/skeleton.tsx"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs.tsx"
import { type Project } from "#/domain/types.ts"
import {
  defaultWorkspaceStep,
  parseBookView,
  parseWorkspaceStep,
  workspaceStepAfterStateChange,
  type BookView,
  type WorkspaceStep,
} from "#/domain/workspace-tabs.ts"
import { projectApi } from "#/lib/api.ts"

export const Route = createFileRoute("/projects/$projectId")({
  validateSearch: (search): { tab?: WorkspaceStep; bookView?: BookView } => ({
    ...search,
    tab: parseWorkspaceStep(search.tab),
    bookView: parseBookView(search.bookView),
  }),
  component: ProjectWorkspace,
})

const steps: Array<{
  value: WorkspaceStep
  label: string
  icon: typeof FileQuestionIcon
}> = [
  {
    value: "form",
    get label() {
      return m.ui_form()
    },
    icon: FileQuestionIcon,
  },
  {
    value: "responses",
    get label() {
      return m.ui_responses()
    },
    icon: InboxIcon,
  },
  {
    value: "layouts",
    get label() {
      return m.ui_layouts()
    },
    icon: LayoutTemplateIcon,
  },
  {
    value: "book",
    get label() {
      return m.ui_book_review()
    },
    icon: BookOpenIcon,
  },
  {
    value: "export",
    get label() {
      return m.ui_export()
    },
    icon: FileOutputIcon,
  },
]

function ProjectWorkspace() {
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projectApi.get(projectId, true),
    refetchInterval: (query) => (query.state.data?.state === "collecting" ? 5_000 : false),
  })
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState("")

  const project = projectQuery.data
  useEffect(() => {
    if (!project) return
    setTitle(project.title)
  }, [project?.id, project?.title])

  useEffect(() => {
    if (!project || search.tab) return
    void navigate({
      to: "/projects/$projectId",
      params: { projectId },
      search: (current) => ({
        ...current,
        tab: defaultWorkspaceStep(project.state),
      }),
      replace: true,
    })
  }, [navigate, project, projectId, search.tab])

  const setProject = (updated: Project) => {
    const nextStep = project && workspaceStepAfterStateChange(project.state, updated.state)
    if (nextStep) {
      void navigate({
        to: "/projects/$projectId",
        params: { projectId },
        search: (current) => ({
          ...current,
          tab: nextStep,
        }),
        replace: true,
      })
    }
    queryClient.setQueryData(["project", projectId], updated)
    void queryClient.invalidateQueries({ queryKey: ["projects"] })
  }

  if (projectQuery.isLoading) {
    return (
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Skeleton className="mb-5 h-40 rounded-xl" />
        <Skeleton className="h-[620px] rounded-xl" />
      </main>
    )
  }
  if (projectQuery.isError || !project) {
    return (
      <main id="main-content" className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Empty className="min-h-80 border bg-card/80">
          <EmptyHeader>
            <EmptyTitle data-testid="heading-project-could-not-be-loaded">
              {m.ui_project_could_not_be_loaded()}
            </EmptyTitle>
            <EmptyDescription>
              {projectQuery.error?.message ?? m.ui_the_project_does_not_exist()}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link
              data-testid="link-return-to-projects"
              to="/projects"
              className={buttonVariants({ variant: "outline" })}
            >
              {m.ui_return_to_projects()}{" "}
            </Link>
          </EmptyContent>
        </Empty>
      </main>
    )
  }

  return (
    <main id="main-content" className="mx-auto max-w-[1540px] px-4 py-8 sm:px-6">
      <Link
        data-testid="link-all-projects"
        to="/projects"
        className={buttonVariants({
          variant: "ghost",
          className: "mb-4",
        })}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        {m.ui_all_projects()}{" "}
      </Link>

      <Card className="mb-6 bg-card/90">
        <CardHeader>
          {editingTitle ? (
            <form
              onSubmit={async (event) => {
                event.preventDefault()
                try {
                  const updated = await projectApi.update(project.id, { title })
                  setProject(updated)
                  setEditingTitle(false)
                  toast.success(m.ui_project_renamed())
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : m.ui_rename_failed())
                }
              }}
              className="flex max-w-xl gap-2"
            >
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                aria-label={m.ui_project_title()}
                autoFocus
              />
              <Button data-testid="button-save" type="submit">
                {m.ui_save()}
              </Button>
              <Button
                data-testid="button-cancel"
                type="button"
                variant="ghost"
                onClick={() => setEditingTitle(false)}
              >
                {m.ui_cancel()}{" "}
              </Button>
            </form>
          ) : (
            <>
              <CardTitle
                data-testid="heading-rename-project"
                className="flex items-center gap-2 text-3xl"
              >
                {project.title}
                {!project.archivedAt && (
                  <Button
                    data-testid="button-rename-project"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={m.ui_rename_project()}
                    onClick={() => {
                      setTitle(project.title)
                      setEditingTitle(true)
                    }}
                  >
                    <PencilIcon />
                  </Button>
                )}
              </CardTitle>
              <CardDescription>
                {project.occasion || m.ui_no_occasion_added()} {m.ui_updated()}{" "}
                {new Date(project.updatedAt).toLocaleString(getLocale())}
              </CardDescription>
            </>
          )}
          <CardAction className="flex items-center gap-2">
            {project.archivedAt && (
              <Badge variant="outline">
                <ArchiveIcon data-icon="inline-start" />
                {m.ui_archived()}{" "}
              </Badge>
            )}
            <Badge className="capitalize">{projectStateLabel(project.state)}</Badge>
            <Badge
              variant={project.bookStatus === "stale" ? "destructive" : "secondary"}
              className="capitalize"
            >
              {m.ui_book()} {bookStatusLabel(project.bookStatus)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-6 text-sm">
            <span>
              <strong className="text-lg">{project.submissionCount}</strong>{" "}
              <span className="text-muted-foreground">
                {m.ui_responses_528({ count: project.submissionCount })}
              </span>
            </span>
            <span>
              <strong className="text-lg">{project.layouts.length}</strong>{" "}
              <span className="text-muted-foreground">
                {m.ui_layouts_529({ count: project.layouts.length })}
              </span>
            </span>
            <span>
              <strong className="text-lg">{project.book?.pages.length ?? 0}</strong>{" "}
              <span className="text-muted-foreground">
                {m.ui_pages_530({ count: project.book?.pages.length ?? 0 })}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {project.archivedAt ? (
              <Button
                data-testid="button-unarchive-project"
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    setProject(await projectApi.action(project.id, "unarchive"))
                    toast.success(m.ui_project_unarchived())
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : m.ui_unarchive_failed())
                  }
                }}
              >
                <ArchiveRestoreIcon data-icon="inline-start" />
                {m.ui_unarchive_project()}{" "}
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger
                  data-testid="button-archive-project"
                  render={<Button variant="outline" size="sm" />}
                >
                  <ArchiveIcon data-icon="inline-start" />
                  {m.ui_archive_project()}{" "}
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle data-testid="heading-archive-this-project">
                      {m.ui_archive_this_project()}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {m.ui_the_project_keeps_its_current()} {projectStateLabel(project.state)}{" "}
                      {m.ui_state_and_every_response_layout_and_export_while_archived_it_acce()}{" "}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel">
                      {m.ui_cancel()}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      data-testid="button-archive-project"
                      onClick={async () => {
                        try {
                          setProject(await projectApi.action(project.id, "archive"))
                          toast.success(m.ui_project_archived())
                        } catch (error) {
                          toast.error(
                            error instanceof Error ? error.message : m.ui_archive_failed()
                          )
                        }
                      }}
                    >
                      {m.ui_archive_project()}{" "}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <AlertDialog>
              <AlertDialogTrigger
                data-testid="button-delete-project"
                render={<Button variant="ghost" size="sm" />}
              >
                <Trash2Icon data-icon="inline-start" />
                {m.ui_delete_project()}{" "}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle data-testid="heading-delete-this-local-project">
                    {m.ui_delete_this_local_project()}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {m.ui_the_project_submissions_layouts_stored_image_masters_previews_and()}{" "}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel">{m.ui_cancel()}</AlertDialogCancel>
                  <AlertDialogAction
                    data-testid="button-delete-everything"
                    variant="destructive"
                    onClick={async () => {
                      try {
                        await projectApi.remove(project.id)
                        await queryClient.invalidateQueries({
                          queryKey: ["projects"],
                        })
                        toast.success(m.ui_project_deleted())
                        await navigate({ to: "/projects" })
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : m.ui_delete_failed())
                      }
                    }}
                  >
                    {m.ui_delete_everything()}{" "}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {project.archivedAt && (
        <Alert className="mb-6">
          <ArchiveIcon />
          <AlertTitle>
            {m.ui_archived_on()} {new Date(project.archivedAt).toLocaleDateString(getLocale())}
          </AlertTitle>
          <AlertDescription>
            {m.ui_everything_stays_readable_but_the_share_link_reports_a_closed_col()}{" "}
          </AlertDescription>
        </Alert>
      )}

      <Tabs
        value={search.tab ?? defaultWorkspaceStep(project.state)}
        onValueChange={(value) => {
          void navigate({
            to: "/projects/$projectId",
            params: { projectId },
            search: (current) => ({
              ...current,
              tab: parseWorkspaceStep(value),
            }),
          })
        }}
      >
        <TabsList
          variant="line"
          className="mb-6 h-auto w-full justify-start overflow-x-auto rounded-xl border bg-card/80 p-1"
        >
          {steps.map((item, index) => (
            <TabsTrigger
              data-testid={`workspace-${item.value}`}
              key={item.value}
              value={item.value}
              className="min-w-fit flex-none px-3 py-2"
            >
              <item.icon data-icon="inline-start" />
              <span className="hidden sm:inline">
                {index + 1}. {item.label}
              </span>
              <span className="sm:hidden">{item.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="form">
          <FormBuilder project={project} onProjectChange={setProject} />
        </TabsContent>
        <TabsContent value="responses">
          <SubmissionsPanel
            project={project}
            onProjectChange={setProject}
            onRefresh={() => void projectQuery.refetch()}
          />
        </TabsContent>
        <TabsContent value="layouts">
          <LayoutsPanel project={project} onProjectChange={setProject} />
        </TabsContent>
        <TabsContent value="book">
          <BookReview
            project={project}
            onProjectChange={setProject}
            view={search.bookView ?? "grid"}
            onEditLayouts={() => {
              void navigate({
                to: "/projects/$projectId",
                params: { projectId },
                search: (current) => ({ ...current, tab: "layouts" }),
              })
            }}
            onViewChange={(bookView) => {
              void navigate({
                to: "/projects/$projectId",
                params: { projectId },
                // Grid is the default, so it stays out of the URL.
                search: (current) => ({
                  ...current,
                  bookView: bookView === "grid" ? undefined : bookView,
                }),
              })
            }}
          />
        </TabsContent>
        <TabsContent value="export">
          <ExportPanel project={project} />
        </TabsContent>
      </Tabs>
    </main>
  )
}
