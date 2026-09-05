import * as m from "#/paraglide/messages.js"
import { problemMessage } from "#/domain/problem-message.ts"
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
import { isCoverRole, layoutRoleLabel, responseLayouts } from "#/domain/layout-roles.ts"
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
            locale: project.bookLanguage,
            submission: submission ?? undefined,
            decorativeAssetUrl,
            photoFocus,
          }}
          testId="preview-layout-elements"
          selectedElementId={selectedElementId}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-destructive">
          {m.ui_missing_source()}{" "}
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
      <DialogTrigger
        data-testid="button-standalone-page"
        render={<Button variant="outline" disabled={layouts.length === 0} />}
      >
        <PlusIcon data-icon="inline-start" />
        {m.ui_standalone_page()}{" "}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle data-testid="heading-add-a-standalone-page">
            {m.ui_add_a_standalone_page()}
          </DialogTitle>
          <DialogDescription>
            {m.ui_standalone_pages_carry_no_response_design_them_in_the_layout_edit()}{" "}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>{m.ui_layout()}</FieldLabel>
            <Select value={selected?.id} onValueChange={(value) => value && setLayoutId(value)}>
              <SelectTrigger
                data-testid="combobox-standalone-page-layout"
                className="w-full"
                aria-label={m.ui_standalone_page_layout()}
              >
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
            data-testid="button-add-page"
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
            {m.ui_add_page()}{" "}
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
        <AlertTitle>{m.ui_no_page_problems()}</AlertTitle>
        <AlertDescription>
          {m.ui_the_generated_pages_are_clear_for_automated_preflight()}
        </AlertDescription>
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
            <span className="text-sm font-medium">{problemMessage(problem)}</span>
            <Badge variant={problem.blocking ? "destructive" : "secondary"}>
              {problem.blocking ? m.ui_blocking() : m.ui_warning()}
            </Badge>
          </span>
          {problem.code === "image-blocking-resolution" && problem.assetId && (
            <Button
              data-testid="button-record-resolution-override"
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={(event) => {
                event.stopPropagation()
                onOverride(problem.assetId!)
              }}
            >
              {m.ui_record_resolution_override()}{" "}
            </Button>
          )}
        </button>
      ))}
    </div>
  )
}

function pageCaption(page: BookPage, project: Project) {
  return (
    project.layouts.find((layout) => layout.id === page.layoutId)?.name ?? m.ui_missing_layout()
  )
}

function pageLabel(page: BookPage, project: Project) {
  const layout = project.layouts.find((candidate) => candidate.id === page.layoutId)
  if (page.kind === "standalone") {
    return layout ? `${layoutRoleLabel(layout.role)}: ${layout.name}` : m.ui_missing_layout()
  }
  const submission = project.submissions?.find((candidate) => candidate.id === page.submissionId)
  return submission ? submissionLabel(project.formSchema, submission) : m.ui_response()
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
              aria-label={m.open_book_page({ value0: index + 1, value1: pageLabel(page, project) })}
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
        <AlertTitle>{m.ui_this_project_is_archived()}</AlertTitle>
        <AlertDescription>
          {m.ui_the_generated_book_is_frozen_unarchive_the_project_to_regenerate_()}{" "}
        </AlertDescription>
      </Alert>
    )
  }
  if (project.state !== "closed") {
    return (
      <Alert>
        <BookOpenIcon />
        <AlertTitle>{m.ui_finish_collection_first()}</AlertTitle>
        <AlertDescription>
          {m.ui_generation_uses_the_final_ordered_set_of_anonymous_submissions()}{" "}
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
          <EmptyTitle data-testid="heading-create-a-layout-first">
            {m.ui_create_a_layout_first()}
          </EmptyTitle>
          <EmptyDescription>
            {m.ui_at_least_one_compatible_layout_is_required_to_generate_submission()}{" "}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const book = project.book
  const pages = book?.pages ?? []
  const selected = pages.find((page) => page.id === selectedId) ?? pages[0]
  const selectedLayout = project.layouts.find((layout) => layout.id === selected?.layoutId)
  // Only response layouts may back a response page; generation would discard any other choice.
  const assignableLayouts = responseLayouts(project.layouts)
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
      if (!updated) throw new Error(m.ui_generation_returned_no_book())
      replaceBook(updated, false)
      setSelectedId(updated.pages[0]?.id ?? null)
      setSelectedProblemId(null)
      setSelectedElementId(null)
      setFocusAssetId(null)
      toast.success(m.ui_complete_book_generated())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : m.ui_generation_failed())
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
      toast.error(error instanceof Error ? error.message : m.ui_book_update_failed())
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
        toast.error(error instanceof Error ? error.message : m.ui_photo_focus_update_failed())
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
          <h2 data-testid="heading-generate-and-review" className="font-heading text-2xl">
            {m.ui_generate_and_review()}
          </h2>
          <p className="text-sm text-muted-foreground">
            {m.ui_one_submission_creates_exactly_one_page_regeneration_always_rebui()}{" "}
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
              <ToggleGroupItem value="grid" aria-label={m.ui_all_pages()}>
                <LayoutGridIcon data-icon="inline-start" />
                {m.ui_all_pages()}{" "}
              </ToggleGroupItem>
              <ToggleGroupItem value="detail" aria-label={m.ui_single_page()}>
                <SquareIcon data-icon="inline-start" />
                {m.ui_single_page()}{" "}
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
            <AlertDialogTrigger data-testid="button-regenerate-complete-book" render={<Button />}>
              {generating ? (
                <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
              ) : book ? (
                <RefreshCwIcon data-icon="inline-start" />
              ) : (
                <WandSparklesIcon data-icon="inline-start" />
              )}
              {book ? m.ui_regenerate_complete_book() : m.ui_generate_book()}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle data-testid="heading-regenerate-every-page">
                  {book ? m.ui_regenerate_every_page() : m.ui_generate_the_book()}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {book
                    ? m.ui_all_submission_pages_and_problems_are_rebuilt_valid_manual_assign()
                    : m.ui_submission_pages_start_in_response_order_using_the_selected_assig()}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel">{m.ui_cancel()}</AlertDialogCancel>
                <AlertDialogAction data-testid="button-regenerate-all" onClick={generate}>
                  {book ? m.ui_regenerate_all() : m.ui_generate()}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Card className="bg-card/90">
        <CardHeader>
          <CardTitle data-testid="heading-assignment-settings">
            {m.ui_assignment_settings()}
          </CardTitle>
          <CardDescription>
            {m.ui_seeded_random_is_reproducible_for_the_same_ordered_inputs()}{" "}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel>{m.ui_mode()}</FieldLabel>
            <Select
              items={[
                { value: "cycle", label: m.ui_cycle_ordered_layouts() },
                { value: "seeded-random", label: m.ui_seeded_random() },
                { value: "manual", label: m.ui_manual_assignments() },
              ]}
              value={settings.mode}
              onValueChange={(mode) =>
                setSettings({
                  ...settings,
                  mode: mode as GenerationSettings["mode"],
                })
              }
            >
              <SelectTrigger
                data-testid="combobox-assignment-mode"
                className="w-full"
                aria-label={m.ui_assignment_mode()}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="cycle">{m.ui_cycle_ordered_layouts()}</SelectItem>
                  <SelectItem value="seeded-random">{m.ui_seeded_random()}</SelectItem>
                  <SelectItem value="manual">{m.ui_manual_assignments()}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="generation-seed">{m.ui_random_seed()}</FieldLabel>
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
            <EmptyTitle data-testid="heading-the-book-has-not-been-generated">
              {m.ui_the_book_has_not_been_generated()}
            </EmptyTitle>
            <EmptyDescription>
              {m.ui_choose_an_assignment_mode_then_generate_one_persisted_page_per_su()}{" "}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button data-testid="button-generate-now" onClick={generate} disabled={generating}>
              {m.ui_generate_now()}{" "}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          {project.bookStatus === "stale" && (
            <Alert variant="destructive">
              <AlertTriangleIcon />
              <AlertTitle>{m.ui_stale_preview()}</AlertTitle>
              <AlertDescription>
                {m.ui_a_rendering_input_changed_this_preview_remains_visible_but_final_()}{" "}
              </AlertDescription>
            </Alert>
          )}
          {view === "grid" ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {problems.filter((problem) => problem.blocking).length} {m.ui_blocking_59()}{" "}
                  {problems.filter((problem) => !problem.blocking).length} {m.ui_warnings()}{" "}
                </p>
                {problems.length > 0 && (
                  <Button
                    data-testid="button-review-problems"
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
                    {m.ui_review_problems()}{" "}
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
                  <CardTitle data-testid="heading-page-order">{m.ui_page_order()}</CardTitle>
                  <CardDescription>{m.ui_drag_or_use_arrow_buttons()}</CardDescription>
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
                                {m.page_problem_count({ count: page.problems.length })}
                              </span>
                            )}
                          </button>
                          <div className="flex flex-col">
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              aria-label={m.move_page_up({ value0: index + 1 })}
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
                              aria-label={m.move_page_down({ value0: index + 1 })}
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
                      <CardTitle data-testid="heading-photo-focus">{m.ui_photo_focus()}</CardTitle>
                      <CardDescription>
                        {m.ui_drag_a_photo_on_the_page_to_choose_which_part_of_it_the_frame_kee()}{" "}
                      </CardDescription>
                      {focusPhoto && (
                        <CardAction>
                          <Button
                            data-testid="button-reset"
                            size="sm"
                            variant="outline"
                            disabled={!focusPhoto.focalPoint}
                            onClick={() => void storeFocalPoint(focusPhoto.assetId, null)}
                          >
                            <Undo2Icon data-icon="inline-start" />
                            {m.ui_reset()}{" "}
                          </Button>
                        </CardAction>
                      )}
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {focusPhoto
                          ? focusPhoto.focalPoint
                            ? m.photo_focus_adjusted({ value0: focusPhoto.name })
                            : m.photo_focus_inherited({ value0: focusPhoto.name })
                          : m.ui_select_a_photo_on_the_page_to_adjust_it()}
                      </p>
                    </CardContent>
                  </Card>
                )}
                {selected?.kind === "submission" && (
                  <Card className="mt-4 bg-card/90">
                    <CardHeader>
                      <CardTitle data-testid="heading-page-layout">{m.ui_page_layout()}</CardTitle>
                      <CardDescription>
                        {m.ui_an_override_becomes_the_stored_manual_assignment()}{" "}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Select
                        items={assignableLayouts.map((layout) => ({
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
                        <SelectTrigger
                          data-testid="combobox-page-layout"
                          className="w-full"
                          aria-label={m.ui_page_layout()}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {assignableLayouts.map((layout) => (
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
                      <CardTitle data-testid="heading-standalone-page">
                        {m.ui_standalone_page()}
                      </CardTitle>
                      <CardDescription>
                        {selectedLayout
                          ? `${selectedLayout.name} — ${layoutRoleLabel(selectedLayout.role)}`
                          : m.ui_this_page_references_a_layout_that_no_longer_exists()}
                      </CardDescription>
                      {selectedLayout?.role === "static" && (
                        <CardAction>
                          <Button
                            data-testid="button-delete-standalone-page"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={m.ui_delete_standalone_page()}
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
                          ? m.pinned_cover_explanation({
                              value0: layoutRoleLabel(selectedLayout.role).toLowerCase(),
                              value1:
                                selectedLayout.role === "front-cover"
                                  ? m.position_first()
                                  : m.position_last(),
                            })
                          : m.ui_design_this_page_in_the_layout_editor_every_change_appears_here_a()}
                      </p>
                      {onEditLayouts && (
                        <Button
                          data-testid="button-open-in-layout-editor"
                          variant="outline"
                          className="self-start"
                          onClick={onEditLayouts}
                        >
                          <LayoutTemplateIcon data-icon="inline-start" />
                          {m.ui_open_in_layout_editor()}{" "}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>

              <Card className="h-fit bg-card/90">
                <CardHeader>
                  <CardTitle data-testid="heading-problems">{m.ui_problems()}</CardTitle>
                  <CardDescription>
                    {problems.filter((problem) => problem.blocking).length} {m.ui_blocking_59()}{" "}
                    {problems.filter((problem) => !problem.blocking).length} {m.ui_warnings()}{" "}
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
                          m.ui_resolution_override_recorded_regenerate_to_re_run_preflight()
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
