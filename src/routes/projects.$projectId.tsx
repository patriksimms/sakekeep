import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import {
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
import { parseWorkspaceStep, type WorkspaceStep } from "#/domain/workspace-tabs.ts"
import { projectApi } from "#/lib/api.ts"

export const Route = createFileRoute("/projects/$projectId")({
  validateSearch: (search): { tab?: WorkspaceStep } => {
    const tab = parseWorkspaceStep(search.tab)
    return tab ? { ...search, tab } : { ...search, tab: undefined }
  },
  component: ProjectWorkspace,
})

const steps: Array<{
  value: WorkspaceStep
  label: string
  icon: typeof FileQuestionIcon
}> = [
  { value: "form", label: "Form", icon: FileQuestionIcon },
  { value: "responses", label: "Responses", icon: InboxIcon },
  { value: "layouts", label: "Layouts", icon: LayoutTemplateIcon },
  { value: "book", label: "Book review", icon: BookOpenIcon },
  { value: "export", label: "Export", icon: FileOutputIcon },
]

function initialStep(project: Project): WorkspaceStep {
  if (project.state === "draft") return "form"
  if (project.state === "collecting") return "responses"
  if (project.layouts.length === 0) return "layouts"
  if (!project.book) return "book"
  return project.bookStatus === "current" ? "export" : "book"
}

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
  const [defaultStep, setDefaultStep] = useState<WorkspaceStep>("form")
  const [workspaceInitialized, setWorkspaceInitialized] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState("")

  const project = projectQuery.data
  useEffect(() => {
    if (!project || workspaceInitialized) return
    setDefaultStep(initialStep(project))
    setTitle(project.title)
    setWorkspaceInitialized(true)
  }, [project, workspaceInitialized])

  const setProject = (updated: Project) => {
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
            <EmptyTitle>Project could not be loaded</EmptyTitle>
            <EmptyDescription>
              {projectQuery.error?.message ?? "The project does not exist."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link to="/projects" className={buttonVariants({ variant: "outline" })}>
              Return to projects
            </Link>
          </EmptyContent>
        </Empty>
      </main>
    )
  }

  return (
    <main id="main-content" className="mx-auto max-w-[1540px] px-4 py-8 sm:px-6">
      <Link
        to="/projects"
        className={buttonVariants({
          variant: "ghost",
          className: "mb-4",
        })}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        All projects
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
                  toast.success("Project renamed")
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Rename failed")
                }
              }}
              className="flex max-w-xl gap-2"
            >
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                aria-label="Project title"
                autoFocus
              />
              <Button type="submit">Save</Button>
              <Button type="button" variant="ghost" onClick={() => setEditingTitle(false)}>
                Cancel
              </Button>
            </form>
          ) : (
            <>
              <CardTitle className="flex items-center gap-2 text-3xl">
                {project.title}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Rename project"
                  onClick={() => {
                    setTitle(project.title)
                    setEditingTitle(true)
                  }}
                >
                  <PencilIcon />
                </Button>
              </CardTitle>
              <CardDescription>
                {project.occasion || "No occasion added"} · Updated{" "}
                {new Date(project.updatedAt).toLocaleString()}
              </CardDescription>
            </>
          )}
          <CardAction className="flex items-center gap-2">
            <Badge className="capitalize">{project.state}</Badge>
            <Badge
              variant={project.bookStatus === "stale" ? "destructive" : "secondary"}
              className="capitalize"
            >
              Book {project.bookStatus.replace("-", " ")}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-6 text-sm">
            <span>
              <strong className="text-lg">{project.submissionCount}</strong>{" "}
              <span className="text-muted-foreground">responses</span>
            </span>
            <span>
              <strong className="text-lg">{project.layouts.length}</strong>{" "}
              <span className="text-muted-foreground">layouts</span>
            </span>
            <span>
              <strong className="text-lg">{project.book?.pages.length ?? 0}</strong>{" "}
              <span className="text-muted-foreground">pages</span>
            </span>
          </div>
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
              <Trash2Icon data-icon="inline-start" />
              Delete project
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this local project?</AlertDialogTitle>
                <AlertDialogDescription>
                  The project, submissions, layouts, stored image masters, previews, and exports
                  will be removed. Safe orphan cleanup retries any object-store failure. This cannot
                  be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={async () => {
                    try {
                      await projectApi.remove(project.id)
                      await queryClient.invalidateQueries({
                        queryKey: ["projects"],
                      })
                      toast.success("Project deleted")
                      await navigate({ to: "/projects" })
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Delete failed")
                    }
                  }}
                >
                  Delete everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <Tabs
        value={search.tab ?? defaultStep}
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
          <BookReview project={project} onProjectChange={setProject} />
        </TabsContent>
        <TabsContent value="export">
          <ExportPanel project={project} />
        </TabsContent>
      </Tabs>
    </main>
  )
}
