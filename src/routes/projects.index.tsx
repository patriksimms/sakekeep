import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import {
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
  if (state === "collecting") return "Collecting"
  if (state === "closed") return "Closed"
  return "Draft"
}

function NewProjectDialog() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [occasion, setOccasion] = useState("")
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const create = useMutation({
    mutationFn: projectApi.create,
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] })
      setOpen(false)
      toast.success("Project created")
      await navigate({
        to: "/projects/$projectId",
        params: { projectId: project.id },
      })
    },
    onError: (error) => toast.error(error.message),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    create.mutate({ title, occasion: occasion || null })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon data-icon="inline-start" />
        New project
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Create a friend book</DialogTitle>
            <DialogDescription>
              Start with a name and optional occasion. You can refine the form before publishing.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="project-title">Project name</FieldLabel>
              <Input
                id="project-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Lea’s farewell book"
                maxLength={200}
                required
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="project-occasion">
                Occasion <span className="text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Input
                id="project-occasion"
                value={occasion}
                onChange={(event) => setOccasion(event.target.value)}
                placeholder="Farewell · September 2026"
                maxLength={200}
              />
              <FieldDescription>This helps you distinguish projects locally.</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending || !title.trim()}>
              {create.isPending && (
                <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
              )}
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ProjectsPage() {
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: projectApi.list,
  })
  const projectList = projects.data?.projects ?? []

  return (
    <main id="main-content" className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="mb-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="flex max-w-2xl flex-col gap-2">
          <p className="text-sm font-semibold tracking-[0.16em] text-primary uppercase">
            Organizer workspace
          </p>
          <h1 className="font-heading text-4xl tracking-tight sm:text-5xl">Your projects</h1>
          <p className="text-muted-foreground">
            Everything here is stored in your local PostgreSQL and RustFS services. Do not use real
            personal data in this prototype.
          </p>
        </div>
        <NewProjectDialog />
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
            <EmptyTitle>Local services are not ready</EmptyTitle>
            <EmptyDescription>
              {projects.error.message} Run <code>bun run setup</code>, then retry.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => projects.refetch()}>
              Retry
            </Button>
          </EmptyContent>
        </Empty>
      ) : projectList.length === 0 ? (
        <Empty className="min-h-80 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderPlusIcon />
            </EmptyMedia>
            <EmptyTitle>No keepsakes yet</EmptyTitle>
            <EmptyDescription>
              Create a draft project, shape its questions, then publish a share link when it feels
              right.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <NewProjectDialog />
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projectList.map((project) => (
            <Card key={project.id} className="min-h-56 bg-card/90">
              <CardHeader>
                <CardTitle className="text-xl">{project.title}</CardTitle>
                <CardDescription>{project.occasion || "No occasion added"}</CardDescription>
                <CardAction>
                  <Badge variant={project.state === "collecting" ? "default" : "secondary"}>
                    {statusLabel(project.state)}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="mt-auto grid grid-cols-2 gap-4">
                <div>
                  <p className="text-2xl font-semibold">{project.submissionCount}</p>
                  <p className="text-xs text-muted-foreground">responses</p>
                </div>
                <div>
                  <p className="text-sm font-medium capitalize">
                    {project.bookStatus.replace("-", " ")}
                  </p>
                  <p className="text-xs text-muted-foreground">book status</p>
                </div>
              </CardContent>
              <CardFooter>
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: project.id }}
                  className={buttonVariants({
                    variant: "ghost",
                    className: "ml-auto",
                  })}
                >
                  Open workspace
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
