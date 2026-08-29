import {
  AlertTriangleIcon,
  ArchiveIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BookOpenIcon,
  FileTextIcon,
  GripVerticalIcon,
  LayoutTemplateIcon,
  LayoutGridIcon,
  LoaderCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  ShuffleIcon,
  SquareIcon,
  Trash2Icon,
  Undo2Icon,
  WandSparklesIcon,
} from "lucide-react"
import { useEffect, useRef, useState, type DragEvent } from "react"
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
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group.tsx"
import { LayoutPageElements } from "#/components/layout-page.tsx"
import { type PhotoFocusControls } from "#/components/photo-focus-slot.tsx"
import {
  findPhoto,
  photoFocalPoint,
  sameFocalPoint,
  withPhotoFocalPoint,
  type FocalPoint,
} from "#/domain/photo-focus.ts"
import {
  type BookPage,
  type GeneratedBook,
  type GenerationSettings,
  type PageProblem,
  type Project,
  type LayoutRecord,
  type StandaloneBookPage,
} from "#/domain/types.ts"
import { isCoverRole, layoutRoleLabel } from "#/domain/layout-roles.ts"
import { pinCoverPages } from "#/domain/generation.ts"
import { submissionLabel } from "#/domain/submission-label.ts"
import { parseBookView, type BookView } from "#/domain/workspace-tabs.ts"
import { captureAnalyticsEvent } from "#/lib/analytics.ts"
import { projectApi } from "#/lib/api.ts"
import { pageSpecification } from "#/domain/page-format.ts"

export function PagePreview({
  page,
  project,
  className,
  decorativeAssetUrl,
  showProblems = true,
  selectedElementId,
  photoFocus,
}: {
  page: BookPage
  project: Project
  className?: string
  decorativeAssetUrl?: (assetId: string) => string
  showProblems?: boolean
  selectedElementId?: string
  photoFocus?: PhotoFocusControls
}) {
  const layout = project.layouts.find((candidate) => candidate.id === page.layoutId)
  const submission =
    page.kind === "submission"
      ? project.submissions?.find((candidate) => candidate.id === page.submissionId)
      : null
  const background = layout?.schema.background ?? "#fffdf7"
  const specification = pageSpecification(project.pageFormat, project.pageOrientation)
  return (
    <div
      className={`paper-shadow relative overflow-hidden rounded-md ring-1 ring-foreground/10 ${className ?? ""}`}
      style={{
        aspectRatio: `${specification.mediaWidthMm} / ${specification.mediaHeightMm}`,
        background,
        containerType: "inline-size",
      }}
      data-testid="page-preview"
    >
      {layout && (page.kind === "standalone" || submission) ? (
        <LayoutPageElements
          schema={layout.schema}
          content={{
            questions: project.formSchema.questions,
            submission: submission ?? undefined,
            decorativeAssetUrl,
            photoFocus,
          }}
          testId="preview-layout-elements"
          selectedElementId={selectedElementId}
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

function AddStandaloneDialog({
  layouts,
  onAdd,
}: {
  layouts: LayoutRecord[]
  onAdd: (page: StandaloneBookPage) => void
}) {
  const [open, setOpen] = useState(false)
  const [layoutId, setLayoutId] = useState(layouts[0]?.id ?? "")
  const selected = layouts.find((layout) => layout.id === layoutId) ?? layouts[0]
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" disabled={layouts.length === 0} />}>
        <PlusIcon data-icon="inline-start" />
        Standalone page
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a standalone page</DialogTitle>
          <DialogDescription>
            Standalone pages carry no response. Design them in the layout editor, then place them
            anywhere in the book.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Layout</FieldLabel>
            <Select value={selected?.id} onValueChange={(value) => value && setLayoutId(value)}>
              <SelectTrigger className="w-full" aria-label="Standalone page layout">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {layouts.map((layout) => (
                    <SelectItem key={layout.id} value={layout.id}>
                      {layout.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            disabled={!selected}
            onClick={() => {
              if (!selected) return
              onAdd({
                id: `standalone:${crypto.randomUUID()}`,
                kind: "standalone",
                layoutId: selected.id,
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
  selectedProblemId,
}: {
  problems: PageProblem[]
  onSelect: (problem: PageProblem) => void
  onOverride: (assetId: string) => void
  selectedProblemId?: string
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
          onClick={() => onSelect(problem)}
          aria-pressed={selectedProblemId === problem.id}
          className="rounded-lg border bg-card p-3 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-destructive aria-pressed:ring-1 aria-pressed:ring-destructive"
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

function pageCaption(page: BookPage, project: Project) {
  return project.layouts.find((layout) => layout.id === page.layoutId)?.name ?? "Missing layout"
}

function pageLabel(page: BookPage, project: Project) {
  const layout = project.layouts.find((candidate) => candidate.id === page.layoutId)
  if (page.kind === "standalone") {
    return layout ? `${layoutRoleLabel(layout.role)}: ${layout.name}` : "Missing layout"
  }
  const submission = project.submissions?.find((candidate) => candidate.id === page.submissionId)
  return submission ? submissionLabel(project.formSchema, submission) : "Response ?"
}

// The grid answers "does the book read well as a whole": every page at once, in order, captioned
// with its layout so repeated layouts are visible at a glance.
function PageGrid({
  book,
  project,
  onOpenPage,
}: {
  book: GeneratedBook
  project: Project
  onOpenPage: (pageId: string) => void
}) {
  return (
    <ol
      className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
      data-testid="book-page-grid"
    >
      {book.pages.map((page, index) => {
        const blocking = page.problems.filter((problem) => problem.blocking).length
        return (
          <li key={page.id}>
            <button
              type="button"
              onClick={() => onOpenPage(page.id)}
              data-testid="book-page-tile"
              aria-label={`Open page ${index + 1}, ${pageLabel(page, project)}`}
              className="group block w-full rounded-md text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className="relative block">
                <PagePreview
                  page={page}
                  project={project}
                  className="w-full transition group-hover:ring-foreground/30"
                  showProblems={false}
                />
                {blocking > 0 && (
                  <Badge variant="destructive" className="absolute top-2 right-2">
                    {blocking}
                  </Badge>
                )}
              </span>
              <span className="mt-1.5 flex items-center gap-1.5 text-xs">
                <span className="tabular-nums text-muted-foreground">{index + 1}</span>
                {page.kind === "standalone" ? (
                  <FileTextIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
                ) : (
                  <LayoutTemplateIcon
                    aria-hidden="true"
                    className="size-3.5 text-muted-foreground"
                  />
                )}
                <span className="truncate">{pageCaption(page, project)}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

export function BookReview({
  project,
  onProjectChange,
  view = "grid",
  onViewChange,
  onEditLayouts,
}: {
  project: Project
  onProjectChange: (project: Project) => void
  view?: BookView
  onViewChange?: (view: BookView) => void
  /** Switches the workspace to the layout editor, where standalone pages are designed. */
  onEditLayouts?: () => void
}) {
  const defaultSettings: GenerationSettings = {
    mode: "cycle",
    seed: "sakekeep",
    manualAssignments: {},
    resolutionOverrides: [],
  }
  const [settings, setSettings] = useState(project.book?.settings ?? defaultSettings)
  const [selectedId, setSelectedId] = useState<string | null>(project.book?.pages[0]?.id ?? null)
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [focusDrafts, setFocusDrafts] = useState<Record<string, FocalPoint>>({})
  const [focusAssetId, setFocusAssetId] = useState<string | null>(null)
  const focalWriteQueue = useRef(new Map<string, Promise<unknown>>())
  const latestFocalWrite = useRef(new Map<string, symbol>())
  const projectRef = useRef(project)

  useEffect(() => {
    projectRef.current = project
  }, [project])

  useEffect(() => {
    if (project.book) setSettings(project.book.settings)
  }, [project.book])

  if (project.archivedAt) {
    return (
      <Alert>
        <ArchiveIcon />
        <AlertTitle>This project is archived</AlertTitle>
        <AlertDescription>
          The generated book is frozen. Unarchive the project to regenerate or edit pages.
        </AlertDescription>
      </Alert>
    )
  }
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
  const selectedLayout = project.layouts.find((layout) => layout.id === selected?.layoutId)
  const problems = pages.flatMap((page) => page.problems)

  const changeView = (next: BookView, source: "toggle" | "page_tile" | "problem_shortcut") => {
    captureAnalyticsEvent("book_review:view_change", {
      view: next,
      page_count: pages.length,
      source,
    })
    onViewChange?.(next)
  }

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
      setSelectedProblemId(null)
      setSelectedElementId(null)
      setFocusAssetId(null)
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

  const submissions = project.submissions ?? []

  // The crop centre lives on the asset, so it is written on its own and deliberately leaves the
  // book alone: no page problem depends on it, and the exporter reads submissions live.
  const storeFocalPoint = (assetId: string, focalPoint: FocalPoint | null) => {
    const previous = photoFocalPoint(submissions, assetId)
    const write = Symbol("focal point write")
    latestFocalWrite.current.set(assetId, write)
    onProjectChange({
      ...project,
      submissions: withPhotoFocalPoint(submissions, assetId, focalPoint ?? undefined),
    })
    // One photo's writes run in order. Overlapping requests can finish out of order, which would
    // leave the printed crop on a value the organizer has already dragged away from.
    const queued = (focalWriteQueue.current.get(assetId) ?? Promise.resolve())
      .then(() => projectApi.setPhotoFocalPoint(project.id, assetId, focalPoint))
      .catch((error: unknown) => {
        // A later write for this photo has already replaced this one, so its rollback would undo
        // an adjustment the organizer still expects to see. Roll back from the newest project
        // rather than the snapshot this call closed over, which may have gone stale meanwhile.
        if (latestFocalWrite.current.get(assetId) === write) {
          const current = projectRef.current
          onProjectChange({
            ...current,
            submissions: withPhotoFocalPoint(current.submissions ?? [], assetId, previous),
          })
        }
        toast.error(error instanceof Error ? error.message : "Photo focus update failed")
      })
    focalWriteQueue.current.set(assetId, queued)
    return queued
  }

  const photoFocus: PhotoFocusControls = {
    draft: focusDrafts,
    selectedAssetId: focusAssetId ?? undefined,
    onSelect: setFocusAssetId,
    onChange: (assetId, focalPoint) =>
      setFocusDrafts((drafts) => ({ ...drafts, [assetId]: focalPoint })),
    onCommit: (assetId, focalPoint) => {
      setFocusDrafts(({ [assetId]: _dropped, ...rest }) => rest)
      if (sameFocalPoint(photoFocalPoint(submissions, assetId), focalPoint)) return
      void storeFocalPoint(assetId, focalPoint)
    },
  }

  const focusPhoto = focusAssetId ? findPhoto(submissions, focusAssetId) : undefined

  const isPinnedPage = (page: BookPage) =>
    isCoverRole(project.layouts.find((layout) => layout.id === page.layoutId)?.role ?? "submission")

  const reorder = (pageId: string, targetId: string) => {
    if (!book || pageId === targetId) return
    const next = [...book.pages]
    const sourceIndex = next.findIndex((page) => page.id === pageId)
    const targetIndex = next.findIndex((page) => page.id === targetId)
    if (isPinnedPage(next[sourceIndex]!)) return
    const [moved] = next.splice(sourceIndex, 1)
    next.splice(targetIndex, 0, moved!)
    void updatePages(pinCoverPages(next, project.layouts))
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
        <div className="flex flex-wrap items-center gap-2">
          {book && (
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              value={[view]}
              onValueChange={(next: string[]) => {
                const requested = parseBookView(next[0])
                if (requested) changeView(requested, "toggle")
              }}
            >
              <ToggleGroupItem value="grid" aria-label="All pages">
                <LayoutGridIcon data-icon="inline-start" />
                All pages
              </ToggleGroupItem>
              <ToggleGroupItem value="detail" aria-label="Single page">
                <SquareIcon data-icon="inline-start" />
                Single page
              </ToggleGroupItem>
            </ToggleGroup>
          )}
          {book && (
            <AddStandaloneDialog
              layouts={project.layouts.filter((layout) => layout.role === "static")}
              onAdd={(page) => void updatePages([...book.pages, page])}
            />
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
          {view === "grid" ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {problems.filter((problem) => problem.blocking).length} blocking ·{" "}
                  {problems.filter((problem) => !problem.blocking).length} warnings
                </p>
                {problems.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const target = problems.find((problem) => problem.blocking) ?? problems[0]
                      if (target) {
                        setSelectedId(target.pageId)
                        setSelectedProblemId(target.id)
                        setSelectedElementId(target.elementId ?? null)
                      }
                      changeView("detail", "problem_shortcut")
                    }}
                  >
                    Review problems
                  </Button>
                )}
              </div>
              <PageGrid
                book={book}
                project={project}
                onOpenPage={(pageId) => {
                  setSelectedId(pageId)
                  setSelectedProblemId(null)
                  setSelectedElementId(null)
                  setFocusAssetId(null)
                  changeView("detail", "page_tile")
                }}
              />
            </div>
          ) : (
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
                          draggable={!isPinnedPage(page)}
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
                            onClick={() => {
                              setSelectedId(page.id)
                              setSelectedProblemId(null)
                              setSelectedElementId(null)
                              setFocusAssetId(null)
                            }}
                            className="min-w-0 flex-1 rounded px-1.5 py-1 text-left text-sm focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            <span className="block truncate">
                              {index + 1}. {pageLabel(page, project)}
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
                              disabled={
                                index === 0 ||
                                isPinnedPage(page) ||
                                isPinnedPage(book.pages[index - 1]!)
                              }
                              onClick={() => reorder(page.id, book.pages[index - 1]!.id)}
                            >
                              <ArrowUpIcon />
                            </Button>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              aria-label={`Move page ${index + 1} down`}
                              disabled={
                                index === book.pages.length - 1 ||
                                isPinnedPage(page) ||
                                isPinnedPage(book.pages[index + 1]!)
                              }
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
                {selected && (
                  <PagePreview
                    page={selected}
                    project={project}
                    className="w-full"
                    selectedElementId={selectedElementId ?? undefined}
                    photoFocus={selected.kind === "submission" ? photoFocus : undefined}
                  />
                )}
                {selected?.kind === "submission" && (
                  <Card className="mt-4 bg-card/90">
                    <CardHeader>
                      <CardTitle>Photo focus</CardTitle>
                      <CardDescription>
                        Drag a photo on the page to choose which part of it the frame keeps. Arrow
                        keys nudge it, and Shift moves further. This does not make the book stale.
                      </CardDescription>
                      {focusPhoto && (
                        <CardAction>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!focusPhoto.focalPoint}
                            onClick={() => void storeFocalPoint(focusPhoto.assetId, null)}
                          >
                            <Undo2Icon data-icon="inline-start" />
                            Reset
                          </Button>
                        </CardAction>
                      )}
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {focusPhoto
                          ? focusPhoto.focalPoint
                            ? `${focusPhoto.name} is adjusted. Reset returns it to the layout's own focus.`
                            : `${focusPhoto.name} still follows the layout's own focus.`
                          : "Select a photo on the page to adjust it."}
                      </p>
                    </CardContent>
                  </Card>
                )}
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
                          setSelectedProblemId(null)
                          setSelectedElementId(null)
                          setFocusAssetId(null)
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
                      <CardTitle>Standalone page</CardTitle>
                      <CardDescription>
                        {selectedLayout
                          ? `${selectedLayout.name} — ${layoutRoleLabel(selectedLayout.role)}`
                          : "This page references a layout that no longer exists."}
                      </CardDescription>
                      {selectedLayout?.role === "static" && (
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
                      )}
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <p className="text-sm text-muted-foreground">
                        {selectedLayout && isCoverRole(selectedLayout.role)
                          ? `The ${layoutRoleLabel(selectedLayout.role).toLowerCase()} always stays ${
                              selectedLayout.role === "front-cover" ? "first" : "last"
                            }. Delete its layout to remove the page.`
                          : "Design this page in the layout editor; every change appears here after the next generation."}
                      </p>
                      {onEditLayouts && (
                        <Button variant="outline" className="self-start" onClick={onEditLayouts}>
                          <LayoutTemplateIcon data-icon="inline-start" />
                          Open in layout editor
                        </Button>
                      )}
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
                      selectedProblemId={selectedProblemId ?? undefined}
                      onSelect={(problem) => {
                        captureAnalyticsEvent("book_review:problem_select", {
                          problem_code: problem.code,
                          blocking: problem.blocking,
                          focuses_element: Boolean(problem.elementId),
                        })
                        setSelectedId(problem.pageId)
                        setSelectedProblemId(problem.id)
                        setSelectedElementId(problem.elementId ?? null)
                      }}
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
                        toast.success(
                          "Resolution override recorded; regenerate to re-run preflight"
                        )
                      }}
                    />
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}
