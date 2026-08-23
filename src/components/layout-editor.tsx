import {
  AlignCenterHorizontalIcon,
  AlignCenterVerticalIcon,
  ArchiveIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BringToFrontIcon,
  CheckIcon,
  CircleIcon,
  CopyIcon,
  GalleryHorizontalIcon,
  GripVerticalIcon,
  ImageIcon,
  ImagePlusIcon,
  LayersIcon,
  LayoutTemplateIcon,
  LoaderCircleIcon,
  LockIcon,
  MinusIcon,
  PlusIcon,
  Redo2Icon,
  RectangleHorizontalIcon,
  SaveIcon,
  SendToBackIcon,
  Trash2Icon,
  TriangleAlertIcon,
  TypeIcon,
  Undo2Icon,
  UnlockIcon,
  XIcon,
  XCircleIcon,
  type LucideIcon,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactElement } from "react"
import { toast } from "sonner"

import {
  LAYOUT_ELEMENT_DRAG_TYPE,
  LayoutCanvas,
  type InlineEditableCanvas,
  type LayoutElementDragData,
} from "#/components/layout-canvas.tsx"
import { LayoutPageElements } from "#/components/layout-page.tsx"
import { NumericField } from "#/components/numeric-field.tsx"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog.tsx"
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx"
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog.tsx"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "#/components/ui/field.tsx"
import { Input } from "#/components/ui/input.tsx"
import { ScrollArea } from "#/components/ui/scroll-area.tsx"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx"
import { Separator } from "#/components/ui/separator.tsx"
import { Switch } from "#/components/ui/switch.tsx"
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs.tsx"
import { Textarea } from "#/components/ui/textarea.tsx"
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip.tsx"
import {
  isEditorDeleteKey,
  moveElementLayer,
  type LayerAction,
} from "#/domain/layout-editor-actions.ts"
import { cssFontStack, FONT_FAMILIES, FONT_FAMILY_GROUPS, type FontFamily } from "#/domain/fonts.ts"
import { BACKGROUND_PRESETS, type BackgroundPreset } from "#/domain/layout-backgrounds.ts"
import { boundTextLabel } from "#/domain/layout-label.ts"
import { reorderElementsFromTopmostList, type DropEdge } from "#/domain/layout-layer-order.ts"
import {
  boundQuestionLabel,
  layoutQuestionPalette,
  questionPrompt,
} from "#/domain/layout-question-palette.ts"
import { addElement, PAGE_SPEC } from "#/domain/layout.ts"
import { photoSlotMismatches } from "#/domain/photo-assignment.ts"
import { enforceMinimumTextBoxHeight } from "#/domain/text-layout.ts"
import {
  type FormQuestion,
  type LayoutElement,
  type LayoutRecord,
  type LayoutSchema,
  type Project,
  type TextSettings,
} from "#/domain/types.ts"
import { api, projectApi } from "#/lib/api.ts"
import { captureAnalyticsEvent } from "#/lib/analytics.ts"

type SaveState = "saved" | "unsaved" | "saving" | "failed"

function BackgroundPicker({
  compact = false,
  onCreate,
}: {
  compact?: boolean
  onCreate: (preset: BackgroundPreset) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [creatingId, setCreatingId] = useState<BackgroundPreset["id"] | null>(null)

  const create = async (preset: BackgroundPreset) => {
    setCreatingId(preset.id)
    try {
      await onCreate(preset)
      captureAnalyticsEvent("layout_editor:background_created", {
        background_id: preset.id,
      })
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Create failed")
    } finally {
      setCreatingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant={compact ? "ghost" : "default"}
            size={compact ? "icon-sm" : "default"}
            aria-label={compact ? "New layout" : undefined}
          />
        }
      >
        <PlusIcon data-icon={compact ? undefined : "inline-start"} />
        {!compact && "New layout"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose a background</DialogTitle>
          <DialogDescription>
            Decorative elements start locked and can be unlocked in the editor.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {BACKGROUND_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              variant="outline"
              className="h-auto min-w-0 flex-col items-stretch gap-2 p-2"
              disabled={creatingId !== null}
              aria-label={`Create ${preset.name} background`}
              onClick={() => void create(preset)}
            >
              <span
                className="relative block aspect-[216/154] w-full overflow-hidden rounded-sm"
                style={{ background: preset.schema.background, containerType: "inline-size" }}
              >
                <LayoutPageElements schema={preset.schema} ariaHidden />
              </span>
              <span className="flex items-center justify-center gap-1">
                {creatingId === preset.id && <LoaderCircleIcon className="animate-spin" />}
                {preset.name}
              </span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function IconAction({
  label,
  disabled = false,
  children,
}: {
  label: string
  disabled?: boolean
  children: ReactElement
}) {
  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className="inline-flex rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              tabIndex={0}
              aria-label={`${label} unavailable`}
            />
          }
        >
          {children}
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function elementLabel(element: LayoutElement, questions: FormQuestion[]): string {
  if (element.type === "static-text") return element.content || "Static text"
  if (
    element.type === "bound-text" ||
    element.type === "image-frame" ||
    element.type === "gallery-frame"
  ) {
    return boundQuestionLabel(questions, element.questionId)
  }
  const labels: Record<LayoutElement["type"], string> = {
    "bound-text": "Question text",
    "static-text": "Static text",
    "image-frame": "Image frame",
    "gallery-frame": "Gallery",
    rectangle: "Rectangle",
    circle: "Circle",
    line: "Line",
    "decorative-image": "Decorative image",
  }
  return labels[element.type]
}

function SaveIndicator({ state }: { state: SaveState }) {
  const value = {
    saved: { icon: CheckIcon, label: "Saved" },
    unsaved: { icon: SaveIcon, label: "Unsaved" },
    saving: { icon: LoaderCircleIcon, label: "Saving…" },
    failed: { icon: XCircleIcon, label: "Save failed" },
  }[state]
  return (
    <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <value.icon className={state === "saving" ? "animate-spin" : undefined} />
      {value.label}
    </span>
  )
}

function PaletteAction({
  label,
  addLabel,
  icon: Icon,
  dragData,
  onAdd,
}: {
  label: string
  addLabel: string
  icon: LucideIcon
  dragData: LayoutElementDragData
  onAdd: () => void
}) {
  return (
    <div className="flex min-w-0 items-center rounded-lg border bg-background">
      <span
        draggable
        data-palette-element-type={dragData.type}
        data-palette-question-id={dragData.questionId}
        title={`Drag ${label} to the canvas`}
        className="flex h-7 min-w-0 cursor-grab items-center gap-1.5 px-2 text-[0.8rem] font-medium select-none active:cursor-grabbing"
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "copy"
          event.dataTransfer.setData(LAYOUT_ELEMENT_DRAG_TYPE, JSON.stringify(dragData))
        }}
      >
        <Icon className="size-4" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="rounded-l-none border-l"
        aria-label={addLabel}
        onClick={onAdd}
      >
        <PlusIcon />
      </Button>
    </div>
  )
}

/**
 * Handwriting faces such as Caveat ship no italic cut, so switching to one
 * drops italic instead of silently rendering upright text.
 */
function withFontFamily(settings: TextSettings, fontFamily: FontFamily): TextSettings {
  const hasItalic = FONT_FAMILIES[fontFamily].hasItalic
  return { ...settings, fontFamily, fontStyle: hasItalic ? settings.fontStyle : "normal" }
}

function TextSettingsEditor({
  settings,
  onChange,
}: {
  settings: TextSettings
  onChange: (settings: TextSettings) => void
}) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel>Font family</FieldLabel>
        <Select
          value={settings.fontFamily}
          onValueChange={(value) => onChange(withFontFamily(settings, value as FontFamily))}
        >
          <SelectTrigger className="w-full" aria-label="Font family">
            <SelectValue style={{ fontFamily: cssFontStack(settings.fontFamily) }} />
          </SelectTrigger>
          <SelectContent>
            {FONT_FAMILY_GROUPS.map((group) => (
              <SelectGroup key={group.category}>
                <SelectLabel>{group.category}</SelectLabel>
                {group.families.map((family) => (
                  <SelectItem
                    key={family}
                    value={family}
                    style={{ fontFamily: cssFontStack(family) }}
                  >
                    {family}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <NumericField
          label="Font size"
          value={settings.fontSize}
          onChange={(fontSize) => onChange({ ...settings, fontSize })}
        />
        <NumericField
          label="Minimum"
          value={settings.minFontSize}
          onChange={(minFontSize) => onChange({ ...settings, minFontSize })}
        />
      </div>
      <Field>
        <FieldLabel>Text colour</FieldLabel>
        <Input
          aria-label="Text colour"
          type="color"
          value={settings.color}
          onChange={(event) => onChange({ ...settings, color: event.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel>Style</FieldLabel>
          <Select
            value={settings.fontStyle}
            onValueChange={(value) =>
              onChange({
                ...settings,
                fontStyle: value as TextSettings["fontStyle"],
              })
            }
          >
            <SelectTrigger className="w-full" aria-label="Font style">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="italic" disabled={!FONT_FAMILIES[settings.fontFamily].hasItalic}>
                  Italic
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Weight</FieldLabel>
          <Select
            value={settings.fontWeight}
            onValueChange={(value) =>
              onChange({
                ...settings,
                fontWeight: value as TextSettings["fontWeight"],
              })
            }
          >
            <SelectTrigger className="w-full" aria-label="Font weight">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="bold">Bold</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field>
        <FieldLabel>Alignment</FieldLabel>
        <Select
          value={settings.alignment}
          onValueChange={(value) =>
            onChange({
              ...settings,
              alignment: value as TextSettings["alignment"],
            })
          }
        >
          <SelectTrigger className="w-full" aria-label="Text alignment">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="center">Centre</SelectItem>
              <SelectItem value="right">Right</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <NumericField
        label="Line height"
        value={settings.lineHeight}
        step={0.05}
        onChange={(lineHeight) => onChange({ ...settings, lineHeight })}
      />
      <Field>
        <FieldLabel>Overflow policy</FieldLabel>
        <Select
          value={settings.overflow}
          onValueChange={(value) =>
            onChange({
              ...settings,
              overflow: value as TextSettings["overflow"],
            })
          }
        >
          <SelectTrigger className="w-full" aria-label="Overflow policy">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="shrink">Shrink to minimum</SelectItem>
              <SelectItem value="truncate">Truncate visibly</SelectItem>
              <SelectItem value="flag">Flag for attention</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  )
}

function ElementInspector({
  element,
  questions,
  onChange,
  onChooseDecorative,
  decorativeUploading,
}: {
  element: LayoutElement
  questions: FormQuestion[]
  onChange: (element: LayoutElement) => void
  onChooseDecorative: (file: File) => void
  decorativeUploading: boolean
}) {
  const updateGeometry = (key: keyof LayoutElement["geometry"], value: number) =>
    onChange({
      ...element,
      geometry: { ...element.geometry, [key]: value },
    })
  const boundQuestion =
    element.type === "bound-text" ||
    element.type === "image-frame" ||
    element.type === "gallery-frame"
      ? questions.find((question) => question.id === element.questionId)
      : undefined

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="font-heading text-lg">{elementLabel(element, questions)}</p>
        <p className="text-xs text-muted-foreground">{element.type}</p>
      </div>
      <FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <NumericField
            label="X (mm)"
            value={element.geometry.x}
            onChange={(value) => updateGeometry("x", value)}
          />
          <NumericField
            label="Y (mm)"
            value={element.geometry.y}
            onChange={(value) => updateGeometry("y", value)}
          />
          <NumericField
            label="Width"
            value={element.geometry.width}
            onChange={(value) => updateGeometry("width", Math.max(0.1, value))}
          />
          <NumericField
            label="Height"
            value={element.geometry.height}
            onChange={(value) => updateGeometry("height", Math.max(0.1, value))}
          />
        </div>
        <NumericField
          label="Rotation"
          value={element.geometry.rotation}
          onChange={(value) => updateGeometry("rotation", value)}
        />
        <NumericField
          label="Opacity"
          value={element.opacity}
          step={0.05}
          min={0}
          max={1}
          onChange={(value) => onChange({ ...element, opacity: value })}
        />
        <Field orientation="horizontal">
          <Switch
            id={`locked-${element.id}`}
            checked={element.locked ?? false}
            onCheckedChange={(checked) => onChange({ ...element, locked: checked === true })}
          />
          <FieldLabel htmlFor={`locked-${element.id}`}>
            {element.locked ? <LockIcon /> : <UnlockIcon />}
            Lock element
          </FieldLabel>
        </Field>
      </FieldGroup>

      {(element.type === "bound-text" ||
        element.type === "image-frame" ||
        element.type === "gallery-frame") && (
        <>
          <Separator />
          <Field>
            <FieldLabel>Question binding</FieldLabel>
            <p
              aria-label="Question binding"
              className="rounded-lg border bg-muted/45 px-3 py-2 text-sm"
            >
              {questionPrompt(boundQuestion)}
            </p>
            <FieldDescription>Frozen with the published questionnaire.</FieldDescription>
          </Field>
        </>
      )}

      {element.type === "bound-text" && (
        <>
          <Separator />
          <TextSettingsEditor
            settings={element.text}
            onChange={(text) => onChange({ ...element, text })}
          />
        </>
      )}
      {element.type === "static-text" && (
        <>
          <Field>
            <FieldLabel>Content</FieldLabel>
            <Textarea
              aria-label="Content"
              value={element.content}
              onChange={(event) => onChange({ ...element, content: event.target.value })}
            />
          </Field>
          <Separator />
          <TextSettingsEditor
            settings={element.text}
            onChange={(text) => onChange({ ...element, text })}
          />
        </>
      )}
      {element.type === "gallery-frame" && (
        <>
          <Field>
            <FieldLabel>Arrangement</FieldLabel>
            <Select
              value={element.arrangement}
              onValueChange={(arrangement) =>
                onChange({
                  ...element,
                  arrangement: arrangement as typeof element.arrangement,
                })
              }
            >
              <SelectTrigger className="w-full" aria-label="Arrangement">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="two-portrait">Two portraits</SelectItem>
                  <SelectItem value="four-square">Four squares</SelectItem>
                  <SelectItem value="hero-two">Hero plus two</SelectItem>
                  <SelectItem value="three-column">Three columns</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <NumericField
            label="Slot gap (mm)"
            value={element.gap}
            onChange={(gap) => onChange({ ...element, gap: Math.max(0, gap) })}
          />
        </>
      )}
      {(element.type === "rectangle" || element.type === "circle" || element.type === "line") && (
        <>
          <Field>
            <FieldLabel>Fill</FieldLabel>
            <Input
              aria-label="Fill colour"
              type="color"
              value={element.fill === "transparent" ? "#ffffff" : element.fill}
              disabled={element.type === "line"}
              onChange={(event) => onChange({ ...element, fill: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>Stroke</FieldLabel>
            <Input
              aria-label="Stroke colour"
              type="color"
              value={element.stroke}
              onChange={(event) => onChange({ ...element, stroke: event.target.value })}
            />
          </Field>
          <NumericField
            label="Stroke width"
            value={element.strokeWidth}
            onChange={(strokeWidth) =>
              onChange({ ...element, strokeWidth: Math.max(0, strokeWidth) })
            }
          />
        </>
      )}
      {element.type === "decorative-image" && (
        <>
          <Separator />
          <Field>
            <FieldLabel>{element.assetId ? "Replace image" : "Choose image"}</FieldLabel>
            <Input
              type="file"
              aria-label={element.assetId ? "Replace decorative image" : "Choose decorative image"}
              accept=".jpg,.jpeg,.png,.webp,.heif,.heic,image/*"
              disabled={decorativeUploading}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (file) onChooseDecorative(file)
              }}
            />
            <FieldDescription>
              {decorativeUploading
                ? "Uploading image…"
                : element.assetId
                  ? "Replacing or removing it keeps this element’s size and position."
                  : "The placeholder appears only in the layout editor."}
            </FieldDescription>
          </Field>
          {element.assetId && (
            <Button
              type="button"
              variant="outline"
              disabled={decorativeUploading}
              onClick={() => onChange({ ...element, assetId: undefined })}
            >
              <Trash2Icon data-icon="inline-start" />
              Remove image
            </Button>
          )}
        </>
      )}
      {(element.type === "decorative-image" ||
        element.type === "image-frame" ||
        element.type === "gallery-frame") && (
        <>
          <Separator />
          <p className="text-sm font-medium">Focal point</p>
          <div className="grid grid-cols-2 gap-3">
            <NumericField
              label="Horizontal"
              value={element.focalPoint?.x ?? 0.5}
              step={0.05}
              onChange={(x) =>
                onChange({
                  ...element,
                  focalPoint: {
                    ...(element.focalPoint ?? { x: 0.5, y: 0.5 }),
                    x: Math.min(1, Math.max(0, x)),
                  },
                })
              }
            />
            <NumericField
              label="Vertical"
              value={element.focalPoint?.y ?? 0.5}
              step={0.05}
              onChange={(y) =>
                onChange({
                  ...element,
                  focalPoint: {
                    ...(element.focalPoint ?? { x: 0.5, y: 0.5 }),
                    y: Math.min(1, Math.max(0, y)),
                  },
                })
              }
            />
          </div>
          <FieldDescription>Values run from 0 to 1.</FieldDescription>
        </>
      )}
    </div>
  )
}

function Editor({
  project,
  layout,
  onSaved,
}: {
  project: Project
  layout: LayoutRecord
  onSaved: (layout: LayoutRecord) => void
}) {
  const [schema, setSchema] = useState(layout.schema)
  const [name, setName] = useState(layout.name)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>("saved")
  const [canvasWidth, setCanvasWidth] = useState(700)
  const [decorativeUploadingId, setDecorativeUploadingId] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; edge: DropEdge } | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const canvas = useRef<InlineEditableCanvas | null>(null)
  const history = useRef<LayoutSchema[]>([layout.schema])
  const historyIndex = useRef(0)
  const revision = useRef(layout.revision)
  const schemaRef = useRef(schema)
  const nameRef = useRef(name)
  const editVersion = useRef(0)
  const savedVersion = useRef(0)
  const saveInFlight = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  schemaRef.current = schema
  nameRef.current = name

  useEffect(() => {
    const node = container.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(320, Math.min(900, entry?.contentRect.width ?? 700))
      setCanvasWidth(width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const save = useCallback(async () => {
    if (savedVersion.current === editVersion.current) return
    if (saveInFlight.current) return
    saveInFlight.current = true
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const version = editVersion.current
    setSaveState("saving")
    try {
      const updated = await projectApi.updateLayout<LayoutRecord>(project.id, layout.id, {
        expectedRevision: revision.current,
        name: nameRef.current,
        schema: schemaRef.current,
      })
      revision.current = updated.revision
      savedVersion.current = version
      onSaved(updated)
      setSaveState(savedVersion.current === editVersion.current ? "saved" : "unsaved")
      if (savedVersion.current !== editVersion.current) {
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => void save(), 400)
      }
    } catch (error) {
      setSaveState("failed")
      toast.error(error instanceof Error ? error.message : "Layout save failed")
    } finally {
      saveInFlight.current = false
    }
  }, [layout.id, onSaved, project.id])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      void save()
    },
    [save]
  )

  useEffect(() => {
    const flushPendingSave = () => {
      if (savedVersion.current === editVersion.current) return
      void fetch(`/api/projects/${project.id}/layouts/${layout.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: revision.current,
          name: nameRef.current,
          schema: schemaRef.current,
        }),
        keepalive: true,
      })
    }
    window.addEventListener("pagehide", flushPendingSave)
    return () => window.removeEventListener("pagehide", flushPendingSave)
  }, [layout.id, project.id])

  const markChanged = (next: LayoutSchema, addHistory = true) => {
    setSchema(next)
    schemaRef.current = next
    editVersion.current += 1
    setSaveState("unsaved")
    if (addHistory) {
      history.current = history.current.slice(0, historyIndex.current + 1)
      history.current.push(structuredClone(next))
      historyIndex.current = history.current.length - 1
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), 700)
  }

  const changeName = (value: string) => {
    setName(value)
    nameRef.current = value
    editVersion.current += 1
    setSaveState("unsaved")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), 700)
  }

  const selected = schema.elements.find((element) => element.id === selectedId)
  const questionPalette = layoutQuestionPalette(project.formSchema.questions)
  const slotMismatches = new Map(
    photoSlotMismatches(schema.elements, project.formSchema.questions).map((mismatch) => [
      mismatch.questionId,
      mismatch,
    ])
  )

  const add = (
    type: LayoutElement["type"],
    questionId?: string,
    center?: { x: number; y: number }
  ) => {
    const next = addElement(schemaRef.current, type, questionId, center)
    const added = next.elements.at(-1)!
    markChanged(next)
    setSelectedId(added.id)
  }

  const changeSelected = (nextElement: LayoutElement) => {
    const question =
      nextElement.type === "bound-text"
        ? project.formSchema.questions.find((item) => item.id === nextElement.questionId)
        : undefined
    const label = nextElement.type === "bound-text" ? boundTextLabel(nextElement, question) : ""
    const constrainedElement = enforceMinimumTextBoxHeight(nextElement, label)
    markChanged({
      ...schema,
      elements: schema.elements.map((element) =>
        element.id === constrainedElement.id ? constrainedElement : element
      ),
    })
  }

  const moveLayer = (action: LayerAction) => {
    if (!selected) return
    const elements = moveElementLayer(schema.elements, selected.id, action)
    if (elements === schema.elements) return
    markChanged({ ...schema, elements })
  }

  const deleteSelected = () => {
    if (!selected) return
    markChanged({
      ...schema,
      elements: schema.elements.filter((element) => element.id !== selected.id),
    })
    setSelectedId(null)
  }

  const selectedIndex = selected
    ? schema.elements.findIndex((element) => element.id === selected.id)
    : -1
  const isBackmost = selectedIndex <= 0
  const isFrontmost = selectedIndex === schema.elements.length - 1

  const resetDrag = () => {
    setDraggedId(null)
    setDropTarget(null)
  }

  const dragOverLayer = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    if (!draggedId || draggedId === targetId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    const bounds = event.currentTarget.getBoundingClientRect()
    const edge: DropEdge = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after"
    setDropTarget((current) =>
      current?.id === targetId && current.edge === edge ? current : { id: targetId, edge }
    )
  }

  const dropLayer = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault()
    const sourceId = draggedId ?? event.dataTransfer.getData("text/plain")
    const bounds = event.currentTarget.getBoundingClientRect()
    const edge =
      dropTarget?.id === targetId
        ? dropTarget.edge
        : event.clientY < bounds.top + bounds.height / 2
          ? "before"
          : "after"
    const elements = reorderElementsFromTopmostList(schema.elements, sourceId, targetId, edge)
    if (elements !== schema.elements) {
      markChanged({ ...schema, elements })
      setSelectedId(sourceId)
    }
    resetDrag()
  }

  const uploadDecorative = async (elementId: string, file: File) => {
    setDecorativeUploadingId(elementId)
    const body = new FormData()
    body.set("file", file)
    try {
      const uploaded = await api<{ id: string }>(`/api/projects/${project.id}/assets`, {
        method: "POST",
        body,
      })
      const current = schemaRef.current
      let changed = false
      const next = {
        ...current,
        elements: current.elements.map((element) => {
          if (element.id !== elementId || element.type !== "decorative-image") return element
          changed = true
          return { ...element, assetId: uploaded.id }
        }),
      }
      if (!changed) return
      markChanged(next)
      setSelectedId(elementId)
      toast.success("Decorative image updated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed")
    } finally {
      setDecorativeUploadingId(null)
    }
  }

  return (
    <div
      aria-label="Layout editor workspace"
      className="grid min-h-0 items-stretch gap-4 xl:grid-cols-[230px_minmax(0,1fr)_280px]"
      onKeyDown={(event) => {
        const activeObject = canvas.current?.getActiveObject() as
          | { isEditing?: boolean }
          | undefined
        const target = event.target as HTMLElement
        const startsInlineEdit =
          event.key === "Enter" &&
          selected?.type === "bound-text" &&
          activeObject?.isEditing !== true &&
          (target instanceof HTMLCanvasElement || target.closest("[data-layer-select]"))
        if (startsInlineEdit && canvas.current?.startInlineEditing?.()) {
          event.preventDefault()
          return
        }
        if (
          !selected ||
          !isEditorDeleteKey(event, event.target, activeObject?.isEditing === true)
        ) {
          return
        }
        event.preventDefault()
        deleteSelected()
      }}
    >
      <Card
        aria-label="Layers"
        className="h-48 bg-card/90 xl:sticky xl:top-20 xl:h-[calc(100dvh-6rem)]"
      >
        <CardHeader>
          <CardTitle>Layers</CardTitle>
          <CardDescription>Topmost first</CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-1 pr-2">
              {[...schema.elements].reverse().map((element) => {
                const label = elementLabel(element, project.formSchema.questions)
                const target = dropTarget?.id === element.id ? dropTarget.edge : null
                return (
                  <div
                    key={element.id}
                    data-layer-row={label}
                    data-dragging={draggedId === element.id || undefined}
                    data-drop-edge={target ?? undefined}
                    className="relative flex items-center rounded-lg data-[dragging=true]:opacity-45 data-[drop-edge=after]:after:absolute data-[drop-edge=after]:after:inset-x-1 data-[drop-edge=after]:after:-bottom-0.5 data-[drop-edge=after]:after:h-0.5 data-[drop-edge=after]:after:rounded-full data-[drop-edge=after]:after:bg-primary data-[drop-edge=before]:before:absolute data-[drop-edge=before]:before:inset-x-1 data-[drop-edge=before]:before:-top-0.5 data-[drop-edge=before]:before:h-0.5 data-[drop-edge=before]:before:rounded-full data-[drop-edge=before]:before:bg-primary"
                    onDragOver={(event) => dragOverLayer(event, element.id)}
                    onDrop={(event) => dropLayer(event, element.id)}
                  >
                    <button
                      type="button"
                      draggable
                      aria-label={`Drag ${label} layer`}
                      className="inline-flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move"
                        event.dataTransfer.setData("text/plain", element.id)
                        setDraggedId(element.id)
                        setDropTarget(null)
                      }}
                      onDragEnd={resetDrag}
                    >
                      <GripVerticalIcon aria-hidden="true" />
                    </button>
                    <Button
                      data-layer-select
                      type="button"
                      variant={selectedId === element.id ? "secondary" : "ghost"}
                      className="h-auto min-w-0 flex-1 justify-start text-left"
                      onClick={() => setSelectedId(element.id)}
                    >
                      <LayersIcon data-icon="inline-start" />
                      <span className="truncate">{label}</span>
                    </Button>
                  </div>
                )
              })}
              {schema.elements.length === 0 && (
                <p className="py-5 text-center text-xs text-muted-foreground">
                  Add an element from the toolbar.
                </p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="min-w-0">
        <Card className="mb-4 bg-card/90">
          <CardContent className="flex flex-col gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {questionPalette.map((item) => {
                const mismatch = slotMismatches.get(item.questionId)
                return (
                  <div
                    key={item.questionId}
                    className="flex min-w-0 items-center justify-between gap-2 rounded-lg border bg-background/70 p-2"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="min-w-0 truncate text-sm font-medium" title={item.prompt}>
                        {item.prompt}
                      </span>
                      {mismatch && (
                        <span className="flex items-center gap-1 text-xs text-destructive">
                          <TriangleAlertIcon aria-hidden="true" className="size-3 shrink-0" />
                          {mismatch.slotCount} photo slot{mismatch.slotCount === 1 ? "" : "s"} for
                          up to {mismatch.maxImages} upload{mismatch.maxImages === 1 ? "" : "s"}
                        </span>
                      )}
                    </span>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {item.actions.map((action) => (
                        <PaletteAction
                          key={action.elementType}
                          label={action.label}
                          addLabel={`Add ${action.label.toLowerCase()} for ${item.prompt}`}
                          icon={
                            action.elementType === "bound-text"
                              ? TypeIcon
                              : action.elementType === "image-frame"
                                ? ImageIcon
                                : GalleryHorizontalIcon
                          }
                          dragData={{ type: action.elementType, questionId: item.questionId }}
                          onAdd={() => add(action.elementType, item.questionId)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <Separator />
            <div className="flex flex-wrap items-center gap-1.5">
              <PaletteAction
                label="Static text"
                addLabel="Add static text"
                icon={TypeIcon}
                dragData={{ type: "static-text" }}
                onAdd={() => add("static-text")}
              />
              <PaletteAction
                label="Rectangle"
                addLabel="Add rectangle"
                icon={RectangleHorizontalIcon}
                dragData={{ type: "rectangle" }}
                onAdd={() => add("rectangle")}
              />
              <PaletteAction
                label="Circle"
                addLabel="Add circle"
                icon={CircleIcon}
                dragData={{ type: "circle" }}
                onAdd={() => add("circle")}
              />
              <PaletteAction
                label="Line"
                addLabel="Add line"
                icon={MinusIcon}
                dragData={{ type: "line" }}
                onAdd={() => add("line")}
              />
              <PaletteAction
                label="Decorative image"
                addLabel="Add decorative image"
                icon={ImagePlusIcon}
                dragData={{ type: "decorative-image" }}
                onAdd={() => add("decorative-image")}
              />
              <Separator orientation="vertical" className="mx-1 h-6" />
              <IconAction label="Undo" disabled={historyIndex.current <= 0}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Undo"
                  disabled={historyIndex.current <= 0}
                  onClick={() => {
                    if (historyIndex.current <= 0) return
                    historyIndex.current -= 1
                    markChanged(structuredClone(history.current[historyIndex.current]!), false)
                  }}
                >
                  <Undo2Icon />
                </Button>
              </IconAction>
              <IconAction
                label="Redo"
                disabled={historyIndex.current >= history.current.length - 1}
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Redo"
                  disabled={historyIndex.current >= history.current.length - 1}
                  onClick={() => {
                    if (historyIndex.current >= history.current.length - 1) return
                    historyIndex.current += 1
                    markChanged(structuredClone(history.current[historyIndex.current]!), false)
                  }}
                >
                  <Redo2Icon />
                </Button>
              </IconAction>
            </div>
          </CardContent>
        </Card>

        <Card aria-label="Selection tools" className="mb-4 bg-card/90">
          <CardContent className="flex min-h-8 flex-wrap items-center gap-1">
            {selected ? (
              <>
                <IconAction label="Align horizontal centre">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Align horizontal centre"
                    onClick={() =>
                      changeSelected({
                        ...selected,
                        geometry: {
                          ...selected.geometry,
                          x: (PAGE_SPEC.trimWidthMm - selected.geometry.width) / 2,
                        },
                      })
                    }
                  >
                    <AlignCenterHorizontalIcon />
                  </Button>
                </IconAction>
                <IconAction label="Align vertical centre">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Align vertical centre"
                    onClick={() =>
                      changeSelected({
                        ...selected,
                        geometry: {
                          ...selected.geometry,
                          y: (PAGE_SPEC.trimHeightMm - selected.geometry.height) / 2,
                        },
                      })
                    }
                  >
                    <AlignCenterVerticalIcon />
                  </Button>
                </IconAction>
                <IconAction label="Send backward one layer" disabled={isBackmost}>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Send backward one layer"
                    disabled={isBackmost}
                    onClick={() => moveLayer("backward")}
                  >
                    <ArrowDownIcon />
                  </Button>
                </IconAction>
                <IconAction label="Bring forward one layer" disabled={isFrontmost}>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Bring forward one layer"
                    disabled={isFrontmost}
                    onClick={() => moveLayer("forward")}
                  >
                    <ArrowUpIcon />
                  </Button>
                </IconAction>
                <IconAction label="Send to back" disabled={isBackmost}>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Send to back"
                    disabled={isBackmost}
                    onClick={() => moveLayer("back")}
                  >
                    <SendToBackIcon />
                  </Button>
                </IconAction>
                <IconAction label="Bring to front" disabled={isFrontmost}>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Bring to front"
                    disabled={isFrontmost}
                    onClick={() => moveLayer("front")}
                  >
                    <BringToFrontIcon />
                  </Button>
                </IconAction>
                <IconAction label="Duplicate selected element">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Duplicate selected element"
                    onClick={() => {
                      const duplicate = {
                        ...structuredClone(selected),
                        id: crypto.randomUUID(),
                        geometry: {
                          ...selected.geometry,
                          x: selected.geometry.x + 4,
                          y: selected.geometry.y + 4,
                        },
                      }
                      markChanged({
                        ...schema,
                        elements: [...schema.elements, duplicate],
                      })
                      setSelectedId(duplicate.id)
                    }}
                  >
                    <CopyIcon />
                  </Button>
                </IconAction>
                <IconAction label="Delete selected element">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Delete selected element"
                    onClick={deleteSelected}
                  >
                    <Trash2Icon />
                  </Button>
                </IconAction>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Select an element to use alignment and layer actions.
              </p>
            )}
          </CardContent>
        </Card>

        <div
          ref={container}
          className="print-canvas flex min-h-[420px] items-center justify-center overflow-auto rounded-xl border p-3 sm:p-6"
        >
          <LayoutCanvas
            schema={schema}
            width={canvasWidth}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={markChanged}
            canvasRef={canvas}
            questions={project.formSchema.questions}
            onDropElement={(data, center) => add(data.type, data.questionId, center)}
          />
        </div>
      </div>

      <Card
        aria-label="Inspector"
        className="h-[28rem] bg-card/90 xl:sticky xl:top-20 xl:h-[calc(100dvh-6rem)]"
      >
        <CardHeader>
          <CardTitle>Inspector</CardTitle>
          <CardAction>
            <SaveIndicator state={saveState} />
          </CardAction>
        </CardHeader>
        <CardContent className="min-h-0 flex-1">
          <ScrollArea className="h-full pr-3">
            <FieldGroup>
              <Field>
                <FieldLabel>Layout name</FieldLabel>
                <Input
                  aria-label="Layout name"
                  value={name}
                  maxLength={200}
                  onChange={(event) => changeName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>Page background</FieldLabel>
                <Input
                  aria-label="Page background"
                  type="color"
                  value={schema.background}
                  onChange={(event) =>
                    markChanged({
                      ...schema,
                      background: event.target.value,
                    })
                  }
                />
              </Field>
            </FieldGroup>
            <Separator className="my-5" />
            {selected ? (
              <ElementInspector
                element={selected}
                questions={project.formSchema.questions}
                onChange={changeSelected}
                onChooseDecorative={(file) => void uploadDecorative(selected.id, file)}
                decorativeUploading={decorativeUploadingId === selected.id}
              />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Select an element on the canvas or in the layers list.
              </p>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

export function LayoutsPanel({
  project,
  onProjectChange,
}: {
  project: Project
  onProjectChange: (project: Project) => void
}) {
  const [selectedId, setSelectedId] = useState(project.layouts[0]?.id ?? null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const selected = project.layouts.find((layout) => layout.id === selectedId) ?? project.layouts[0]

  useEffect(() => {
    if (selectedId && !project.layouts.some((layout) => layout.id === selectedId)) {
      setSelectedId(project.layouts[0]?.id ?? null)
    }
  }, [project.layouts, selectedId])

  if (project.archivedAt) {
    return (
      <Alert>
        <ArchiveIcon />
        <AlertTitle>This project is archived</AlertTitle>
        <AlertDescription>
          Layouts stay exactly as they were. Unarchive the project to edit them again.
        </AlertDescription>
      </Alert>
    )
  }

  if (project.state !== "closed") {
    return (
      <Alert>
        <LockIcon />
        <AlertTitle>Layout authoring begins after collection closes</AlertTitle>
        <AlertDescription>
          This keeps the workflow deliberate and ensures the response set is final before
          generation.
        </AlertDescription>
      </Alert>
    )
  }

  const updateLayouts = (layouts: LayoutRecord[]) =>
    onProjectChange({
      ...project,
      layouts,
      bookStatus: project.bookStatus === "not-generated" ? "not-generated" : "stale",
    })

  const deleteSelectedLayout = async () => {
    if (!selected) return

    try {
      await projectApi.deleteLayout(project.id, selected.id)
      const index = project.layouts.findIndex((layout) => layout.id === selected.id)
      const remaining = project.layouts
        .filter((layout) => layout.id !== selected.id)
        .map((layout, position) => ({ ...layout, position }))
      setSelectedId(remaining[Math.max(0, index - 1)]?.id ?? null)
      updateLayouts(remaining)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed")
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h2 className="font-heading text-2xl">Page layouts</h2>
          <p className="text-sm text-muted-foreground">
            Canonical millimetre geometry powers Fabric interaction and final rendering.
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Tabs
              className="min-w-0 flex-1"
              value={selected?.id ?? ""}
              onValueChange={setSelectedId}
            >
              <TabsList className="max-w-full justify-start overflow-x-auto">
                {project.layouts.map((layout) => {
                  const active = layout.id === selected?.id

                  return (
                    <TabsTrigger
                      key={layout.id}
                      value={layout.id}
                      className="max-w-56 shrink-0 text-foreground"
                      onKeyDown={(event) => {
                        if (active && event.key === "Delete") setDeleteDialogOpen(true)
                      }}
                    >
                      <span className="truncate">{layout.name}</span>
                      {active && (
                        <span
                          aria-label={`Delete ${layout.name}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            setDeleteDialogOpen(true)
                          }}
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <XIcon />
                        </span>
                      )}
                    </TabsTrigger>
                  )
                })}
              </TabsList>
            </Tabs>
            <BackgroundPicker
              compact
              onCreate={async (preset) => {
                const layout = await projectApi.layoutAction<LayoutRecord>(project.id, {
                  action: "create",
                  name:
                    preset.id === "blank"
                      ? `Layout ${project.layouts.length + 1}`
                      : `${preset.name} background`,
                  backgroundPresetId: preset.id,
                })
                updateLayouts([...project.layouts, layout])
                setSelectedId(layout.id)
              }}
            />
          </div>
          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this layout?</AlertDialogTitle>
                <AlertDialogDescription>
                  If this layout is used in the generated book, you must regenerate before export.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => void deleteSelectedLayout()}
                >
                  Delete layout
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {selected && (
            <>
              <IconAction label="Move layout up" disabled={selected.position === 0}>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Move layout up"
                  disabled={selected.position === 0}
                  onClick={async () => {
                    if (selected.position === 0) return
                    const ids = project.layouts.map((layout) => layout.id)
                    const index = ids.indexOf(selected.id)
                    ;[ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]
                    const result = await projectApi.layoutAction<{
                      layouts: LayoutRecord[]
                    }>(project.id, { action: "reorder", layoutIds: ids })
                    updateLayouts(result.layouts)
                  }}
                >
                  <ArrowUpIcon />
                </Button>
              </IconAction>
              <IconAction
                label="Move layout down"
                disabled={selected.position === project.layouts.length - 1}
              >
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Move layout down"
                  disabled={selected.position === project.layouts.length - 1}
                  onClick={async () => {
                    if (selected.position === project.layouts.length - 1) return
                    const ids = project.layouts.map((layout) => layout.id)
                    const index = ids.indexOf(selected.id)
                    ;[ids[index + 1], ids[index]] = [ids[index], ids[index + 1]]
                    const result = await projectApi.layoutAction<{
                      layouts: LayoutRecord[]
                    }>(project.id, { action: "reorder", layoutIds: ids })
                    updateLayouts(result.layouts)
                  }}
                >
                  <ArrowDownIcon />
                </Button>
              </IconAction>
              <Button
                variant="outline"
                onClick={async () => {
                  const duplicate = await projectApi.layoutAction<LayoutRecord>(project.id, {
                    action: "duplicate",
                    layoutId: selected.id,
                  })
                  updateLayouts([...project.layouts, duplicate])
                  setSelectedId(duplicate.id)
                }}
              >
                <CopyIcon data-icon="inline-start" />
                Duplicate layout
              </Button>
            </>
          )}
        </div>
      </div>

      {selected ? (
        <Editor
          key={selected.id}
          project={project}
          layout={selected}
          onSaved={(updated) =>
            updateLayouts(
              project.layouts.map((layout) => (layout.id === updated.id ? updated : layout))
            )
          }
        />
      ) : (
        <Card className="min-h-80 bg-card/80">
          <CardHeader className="m-auto place-items-center text-center">
            <span className="mb-2 flex size-12 items-center justify-center rounded-xl bg-muted">
              <LayoutTemplateIcon />
            </span>
            <CardTitle>Create the first layout</CardTitle>
            <CardDescription>
              Add text, image frames, galleries, shapes, and decorative images.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  )
}
