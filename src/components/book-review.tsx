import {
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BookOpenIcon,
  GripVerticalIcon,
  LayoutTemplateIcon,
  LoaderCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  ShuffleIcon,
  Trash2Icon,
  WandSparklesIcon,
} from "lucide-react"
import { useEffect, useState, type DragEvent } from "react"
import { toast } from "sonner"

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
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
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
import { Field, FieldGroup, FieldLabel } from "#/components/ui/field.tsx"
import { Input } from "#/components/ui/input.tsx"
import { ScrollArea } from "#/components/ui/scroll-area.tsx"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx"
import { Textarea } from "#/components/ui/textarea.tsx"
import { LayoutPageElements } from "#/components/layout-page.tsx"
import {
  type BookPage,
  type GeneratedBook,
  type GenerationSettings,
  type PageProblem,
  type Project,
  type StandaloneBookPage,
  type StandalonePageType,
} from "#/domain/types.ts"
import { projectApi } from "#/lib/api.ts"

export function PagePreview({
  page,
  project,
  className,
  decorativeAssetUrl,
  showProblems = true,
}: {
  page: BookPage
  project: Project
  className?: string
  decorativeAssetUrl?: (assetId: string) => string
  showProblems?: boolean
}) {
  const layout =
    page.kind === "submission"
      ? project.layouts.find((candidate) => candidate.id === page.layoutId)
      : null
  const submission =
    page.kind === "submission"
      ? project.submissions?.find((candidate) => candidate.id === page.submissionId)
      : null
  const background =
    page.kind === "standalone" ? page.background : (layout?.schema.background ?? "#fffdf7")
  return (
    <div
      className={`paper-shadow relative aspect-[216/154] overflow-hidden rounded-md ring-1 ring-foreground/10 ${className ?? ""}`}
      style={{ background, containerType: "inline-size" }}
      data-testid="page-preview"
    >
      {page.kind === "standalone" ? (
        page.pageType !== "blank" && (
          <div className="absolute inset-[12%] flex flex-col justify-center">
            <p className="font-heading text-[clamp(10px,3vw,28px)] leading-tight">{page.title}</p>
            <p className="mt-2 line-clamp-5 whitespace-pre-wrap text-[clamp(5px,1.1vw,12px)] text-muted-foreground">
              {page.body}
            </p>
          </div>
        )
      ) : layout && submission ? (
        <LayoutPageElements
          schema={layout.schema}
          content={{
            questions: project.formSchema.questions,
            submission,
            decorativeAssetUrl,
          }}
          testId="preview-layout-elements"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-destructive">
          Missing source
        </div>
      )}
      {showProblems && page.problems.length > 0 && (
        <Badge
          variant={page.problems.some((problem) => problem.blocking) ? "destructive" : "secondary"}
          className="absolute top-2 right-2"
        >
          {page.problems.length}
        </Badge>
      )}
    </div>
  )
}

function AddStandaloneDialog({ onAdd }: { onAdd: (page: StandaloneBookPage) => void }) {
  const [open, setOpen] = useState(false)
  const [pageType, setPageType] = useState<StandalonePageType>("cover")
  const [title, setTitle] = useState("A book of memories")
  const [body, setBody] = useState("")
  const [background, setBackground] = useState("#f4ede1")
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <PlusIcon data-icon="inline-start" />
        Standalone page
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a standalone page</DialogTitle>
          <DialogDescription>
            Cover, introduction, closing, and blank pages are independent of submissions.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Page type</FieldLabel>
            <Select
              value={pageType}
              onValueChange={(value) => setPageType(value as StandalonePageType)}
            >
              <SelectTrigger className="w-full" aria-label="Standalone page type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="cover">Cover</SelectItem>
                  <SelectItem value="introduction">Introduction</SelectItem>
                  <SelectItem value="closing">Closing</SelectItem>
                  <SelectItem value="blank">Blank</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {pageType !== "blank" && (
            <>
              <Field>
                <FieldLabel>Title</FieldLabel>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} />
              </Field>
              <Field>
                <FieldLabel>Body</FieldLabel>
                <Textarea value={body} onChange={(event) => setBody(event.target.value)} />
              </Field>
            </>
          )}
          <Field>
            <FieldLabel>Background</FieldLabel>
            <Input
              type="color"
              value={background}
              onChange={(event) => setBackground(event.target.value)}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            onClick={() => {
              onAdd({
                id: `standalone:${crypto.randomUUID()}`,
                kind: "standalone",
                pageType,
                title: pageType === "blank" ? "" : title,
                body: pageType === "blank" ? "" : body,
                background,
                problems: [],
              })
              setOpen(false)
            }}
          >
            Add page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProblemList({
  problems,
  onSelect,
  onOverride,
}: {
  problems: PageProblem[]
  onSelect: (pageId: string) => void
  onOverride: (assetId: string) => void
}) {
  if (problems.length === 0) {
    return (
      <Alert>
        <BookOpenIcon />
        <AlertTitle>No page problems</AlertTitle>
        <AlertDescription>The generated pages are clear for automated preflight.</AlertDescription>
      </Alert>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {problems.map((problem) => (
        <button
          key={problem.id}
          type="button"
          onClick={() => onSelect(problem.pageId)}
          className="rounded-lg border bg-card p-3 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{problem.message}</span>
            <Badge variant={problem.blocking ? "destructive" : "secondary"}>
              {problem.blocking ? "Blocking" : "Warning"}
            </Badge>
          </span>
          {problem.code === "image-blocking-resolution" && problem.assetId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={(event) => {
                event.stopPropagation()
                onOverride(problem.assetId!)
              }}
            >
              Record resolution override
            </Button>
          )}
        </button>
      ))}
    </div>
  )
}

export function BookReview({
  project,
  onProjectChange,
}: {
  project: Project
  onProjectChange: (project: Project) => void
}) {
  const defaultSettings: GenerationSettings = {
    mode: "cycle",
    seed: "sakekeep",
    manualAssignments: {},
    resolutionOverrides: [],
  }
  const [settings, setSettings] = useState(project.book?.settings ?? defaultSettings)
  const [selectedId, setSelectedId] = useState<string | null>(project.book?.pages[0]?.id ?? null)
  const [generating, setGenerating] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)

  useEffect(() => {
    if (project.book) setSettings(project.book.settings)
  }, [project.book])

  if (project.state !== "closed") {
    return (
      <Alert>
        <BookOpenIcon />
        <AlertTitle>Finish collection first</AlertTitle>
        <AlertDescription>
          Generation uses the final ordered set of anonymous submissions.
        </AlertDescription>
      </Alert>
    )
  }
  if (project.layouts.length === 0) {
    return (
      <Empty className="min-h-72 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LayoutTemplateIcon />
          </EmptyMedia>
          <EmptyTitle>Create a layout first</EmptyTitle>
          <EmptyDescription>
            At least one compatible layout is required to generate submission pages.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const book = project.book
  const pages = book?.pages ?? []
  const selected = pages.find((page) => page.id === selectedId) ?? pages[0]
  const problems = pages.flatMap((page) => page.problems)

  const replaceBook = (updated: GeneratedBook, stale: boolean) =>
    onProjectChange({
      ...project,
      book: updated,
      bookStatus: stale ? "stale" : "current",
    })

  const generate = async () => {
    setGenerating(true)
    try {
      const updated = await projectApi.generate(project.id, settings)
      if (!updated) throw new Error("Generation returned no book.")
      replaceBook(updated, false)
      setSelectedId(updated.pages[0]?.id ?? null)
      toast.success("Complete book generated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed")
    } finally {
      setGenerating(false)
    }
  }

  const updatePages = async (nextPages: BookPage[]) => {
    try {
      const updated = await projectApi.updateBook(project.id, {
        pages: nextPages,
      })
      replaceBook(updated, true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Book update failed")
    }
  }

  const reorder = (pageId: string, targetId: string) => {
    if (!book || pageId === targetId) return
    const next = [...book.pages]
    const sourceIndex = next.findIndex((page) => page.id === pageId)
    const targetIndex = next.findIndex((page) => page.id === targetId)
    const [moved] = next.splice(sourceIndex, 1)
    next.splice(targetIndex, 0, moved!)
    void updatePages(next)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h2 className="font-heading text-2xl">Generate and review</h2>
          <p className="text-sm text-muted-foreground">
            One submission creates exactly one page. Regeneration always rebuilds the complete book.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {book && (
            <AddStandaloneDialog onAdd={(page) => void updatePages([...book.pages, page])} />
          )}
          <AlertDialog>
            <AlertDialogTrigger render={<Button />}>
              {generating ? (
                <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
              ) : book ? (
                <RefreshCwIcon data-icon="inline-start" />
              ) : (
                <WandSparklesIcon data-icon="inline-start" />
              )}
              {book ? "Regenerate complete book" : "Generate book"}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {book ? "Regenerate every page?" : "Generate the book?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {book
                    ? "All submission pages and problems are rebuilt. Valid manual assignments, page order, and standalone pages are preserved."
                    : "Submission pages start in response order using the selected assignment mode."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={generate}>
                  {book ? "Regenerate all" : "Generate"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Card className="bg-card/90">
        <CardHeader>
          <CardTitle>Assignment settings</CardTitle>
          <CardDescription>
            Seeded random is reproducible for the same ordered inputs.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel>Mode</FieldLabel>
            <Select
              value={settings.mode}
              onValueChange={(mode) =>
                setSettings({
                  ...settings,
                  mode: mode as GenerationSettings["mode"],
                })
              }
            >
              <SelectTrigger className="w-full" aria-label="Assignment mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="cycle">Cycle ordered layouts</SelectItem>
                  <SelectItem value="seeded-random">Seeded random</SelectItem>
                  <SelectItem value="manual">Manual assignments</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="generation-seed">Random seed</FieldLabel>
            <Input
              id="generation-seed"
              value={settings.seed}
              maxLength={200}
              onChange={(event) => setSettings({ ...settings, seed: event.target.value })}
              disabled={settings.mode !== "seeded-random"}
            />
          </Field>
        </CardContent>
      </Card>

      {!book ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShuffleIcon />
            </EmptyMedia>
            <EmptyTitle>The book has not been generated</EmptyTitle>
            <EmptyDescription>
              Choose an assignment mode, then generate one persisted page per submission.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={generate} disabled={generating}>
              Generate now
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          {project.bookStatus === "stale" && (
            <Alert variant="destructive">
              <AlertTriangleIcon />
              <AlertTitle>Stale preview</AlertTitle>
              <AlertDescription>
                A rendering input changed. This preview remains visible, but final export is blocked
                until complete regeneration.
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)_320px]">
            <Card className="h-fit bg-card/90">
              <CardHeader>
                <CardTitle>Page order</CardTitle>
                <CardDescription>Drag or use arrow buttons.</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[620px]">
                  <ol className="flex flex-col gap-2 pr-2">
                    {book.pages.map((page, index) => (
                      <li
                        key={page.id}
                        draggable
                        onDragStart={() => setDraggedId(page.id)}
                        onDragOver={(event: DragEvent) => event.preventDefault()}
                        onDrop={() => {
                          if (draggedId) reorder(draggedId, page.id)
                          setDraggedId(null)
                        }}
                        className="flex items-center gap-1 rounded-lg border bg-background p-1"
                      >
                        <GripVerticalIcon aria-hidden="true" className="text-muted-foreground" />
                        <button
                          type="button"
                          onClick={() => setSelectedId(page.id)}
                          className="min-w-0 flex-1 rounded px-1.5 py-1 text-left text-sm focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <span className="block truncate">
                            {index + 1}.{" "}
                            {page.kind === "submission"
                              ? `Response ${project.submissions?.find((submission) => submission.id === page.submissionId)?.sequence ?? "?"}`
                              : `${page.pageType}: ${page.title || "Blank"}`}
                          </span>
                          {page.problems.length > 0 && (
                            <span className="text-xs text-destructive">
                              {page.problems.length} problem
                              {page.problems.length === 1 ? "" : "s"}
                            </span>
                          )}
                        </button>
                        <div className="flex flex-col">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`Move page ${index + 1} up`}
                            disabled={index === 0}
                            onClick={() => reorder(page.id, book.pages[index - 1]!.id)}
                          >
                            <ArrowUpIcon />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`Move page ${index + 1} down`}
                            disabled={index === book.pages.length - 1}
                            onClick={() => reorder(page.id, book.pages[index + 1]!.id)}
                          >
                            <ArrowDownIcon />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ol>
                </ScrollArea>
              </CardContent>
            </Card>

            <div className="min-w-0">
              {selected && <PagePreview page={selected} project={project} className="w-full" />}
              {selected?.kind === "submission" && (
                <Card className="mt-4 bg-card/90">
                  <CardHeader>
                    <CardTitle>Page layout</CardTitle>
                    <CardDescription>
                      An override becomes the stored manual assignment.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Select
                      items={project.layouts.map((layout) => ({
                        label: layout.name,
                        value: layout.id,
                      }))}
                      value={selected.layoutId}
                      onValueChange={async (layoutId) => {
                        const manualAssignments = {
                          ...book.settings.manualAssignments,
                          [selected.submissionId]: layoutId,
                        }
                        const nextPages = book.pages.map((page) =>
                          page.id === selected.id && page.kind === "submission"
                            ? { ...page, layoutId }
                            : page
                        )
                        const updated = await projectApi.updateBook(project.id, {
                          pages: nextPages,
                          settings: {
                            ...book.settings,
                            manualAssignments,
                          },
                        })
                        replaceBook(updated, true)
                      }}
                    >
                      <SelectTrigger className="w-full" aria-label="Page layout">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {project.layouts.map((layout) => (
                            <SelectItem key={layout.id} value={layout.id}>
                              {layout.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              )}
              {selected?.kind === "standalone" && (
                <Card className="mt-4 bg-card/90">
                  <CardHeader>
                    <CardTitle>Edit standalone page</CardTitle>
                    <CardAction>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Delete standalone page"
                        onClick={() =>
                          void updatePages(book.pages.filter((page) => page.id !== selected.id))
                        }
                      >
                        <Trash2Icon />
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <FieldGroup>
                      <Field>
                        <FieldLabel>Title</FieldLabel>
                        <Input
                          value={selected.title}
                          disabled={selected.pageType === "blank"}
                          onChange={(event) =>
                            void updatePages(
                              book.pages.map((page) =>
                                page.id === selected.id && page.kind === "standalone"
                                  ? { ...page, title: event.target.value }
                                  : page
                              )
                            )
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Body</FieldLabel>
                        <Textarea
                          value={selected.body}
                          disabled={selected.pageType === "blank"}
                          onChange={(event) =>
                            void updatePages(
                              book.pages.map((page) =>
                                page.id === selected.id && page.kind === "standalone"
                                  ? { ...page, body: event.target.value }
                                  : page
                              )
                            )
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Background</FieldLabel>
                        <Input
                          type="color"
                          value={selected.background}
                          onChange={(event) =>
                            void updatePages(
                              book.pages.map((page) =>
                                page.id === selected.id && page.kind === "standalone"
                                  ? { ...page, background: event.target.value }
                                  : page
                              )
                            )
                          }
                        />
                      </Field>
                    </FieldGroup>
                  </CardContent>
                </Card>
              )}
            </div>

            <Card className="h-fit bg-card/90">
              <CardHeader>
                <CardTitle>Problems</CardTitle>
                <CardDescription>
                  {problems.filter((problem) => problem.blocking).length} blocking ·{" "}
                  {problems.filter((problem) => !problem.blocking).length} warnings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[620px] pr-2">
                  <ProblemList
                    problems={problems}
                    onSelect={setSelectedId}
                    onOverride={async (assetId) => {
                      const nextSettings = {
                        ...book.settings,
                        resolutionOverrides: Array.from(
                          new Set([...book.settings.resolutionOverrides, assetId])
                        ),
                      }
                      const updated = await projectApi.updateBook(project.id, {
                        settings: nextSettings,
                      })
                      replaceBook(updated, true)
                      toast.success("Resolution override recorded; regenerate to re-run preflight")
                    }}
                  />
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
