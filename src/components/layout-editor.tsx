import { type Canvas } from "fabric"
import {
  AlignCenterHorizontalIcon,
  AlignCenterVerticalIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BringToFrontIcon,
  CheckIcon,
  CircleIcon,
  CopyIcon,
  GalleryHorizontalIcon,
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
  TypeIcon,
  Undo2Icon,
  UnlockIcon,
  XCircleIcon,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
} from "react"
import { toast } from "sonner"

import { LayoutCanvas } from "#/components/layout-canvas.tsx"
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
import { Button } from "#/components/ui/button.tsx"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "#/components/ui/field.tsx"
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
import { Separator } from "#/components/ui/separator.tsx"
import { Switch } from "#/components/ui/switch.tsx"
import { Textarea } from "#/components/ui/textarea.tsx"
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip.tsx"
import {
  isEditorDeleteKey,
  moveElementLayer,
  type LayerAction,
} from "#/domain/layout-editor-actions.ts"
import { addElement, PAGE_SPEC } from "#/domain/layout.ts"
import {
  type FormQuestion,
  type LayoutElement,
  type LayoutRecord,
  type LayoutSchema,
  type Project,
  type TextSettings,
} from "#/domain/types.ts"
import { api, projectApi } from "#/lib/api.ts"

type SaveState = "saved" | "unsaved" | "saving" | "failed"

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
    return (
      questions.find((question) => question.id === element.questionId)?.prompt || "Unbound element"
    )
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

function NumericField({
  label,
  value,
  onChange,
  step = 0.5,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  step?: number
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input
        aria-label={label}
        type="number"
        step={step}
        value={Number(value.toFixed(3))}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
      />
    </Field>
  )
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
          onValueChange={(value) =>
            onChange({
              ...settings,
              fontFamily: value as TextSettings["fontFamily"],
            })
          }
        >
          <SelectTrigger className="w-full" aria-label="Font family">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="Inter">Inter</SelectItem>
              <SelectItem value="Source Serif 4">Source Serif 4</SelectItem>
            </SelectGroup>
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
                <SelectItem value="italic">Italic</SelectItem>
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
}: {
  element: LayoutElement
  questions: FormQuestion[]
  onChange: (element: LayoutElement) => void
}) {
  const updateGeometry = (key: keyof LayoutElement["geometry"], value: number) =>
    onChange({
      ...element,
      geometry: { ...element.geometry, [key]: value },
    })
  const compatibleQuestions =
    element.type === "image-frame" || element.type === "gallery-frame"
      ? questions.filter((question) => question.type === "images")
      : questions.filter(
          (question) =>
            question.type === "single-line" ||
            question.type === "multiline" ||
            question.type === "radio" ||
            question.type === "checkboxes"
        )

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
          onChange={(value) => onChange({ ...element, opacity: Math.min(1, Math.max(0, value)) })}
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
            <Select
              value={element.questionId}
              onValueChange={(questionId) => {
                if (questionId) onChange({ ...element, questionId })
              }}
            >
              <SelectTrigger className="w-full" aria-label="Question binding">
                <SelectValue placeholder="Choose a question" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {compatibleQuestions.map((question) => (
                    <SelectItem key={question.id} value={question.id}>
                      {question.prompt || "Untitled question"}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </>
      )}

      {element.type === "bound-text" && (
        <>
          <Field orientation="horizontal">
            <Switch
              id={`label-${element.id}`}
              checked={element.showLabel}
              onCheckedChange={(checked) => onChange({ ...element, showLabel: checked === true })}
            />
            <FieldLabel htmlFor={`label-${element.id}`}>Show label</FieldLabel>
          </Field>
          {element.showLabel && (
            <Field>
              <FieldLabel>Custom label</FieldLabel>
              <Input
                aria-label="Custom label"
                value={element.label ?? ""}
                placeholder="Uses the question when blank"
                onChange={(event) => onChange({ ...element, label: event.target.value })}
              />
            </Field>
          )}
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
  const container = useRef<HTMLDivElement>(null)
  const canvas = useRef<Canvas | null>(null)
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
  const textQuestion = project.formSchema.questions.find(
    (question) =>
      question.type === "single-line" ||
      question.type === "multiline" ||
      question.type === "radio" ||
      question.type === "checkboxes"
  )
  const imageQuestion = project.formSchema.questions.find((question) => question.type === "images")

  const add = (type: LayoutElement["type"]) => {
    const binding =
      type === "image-frame" || type === "gallery-frame" ? imageQuestion?.id : textQuestion?.id
    let next = addElement(schema, type, binding)
    const added = next.elements.at(-1)!
    if (type === "bound-text" && !binding) return
    if ((type === "image-frame" || type === "gallery-frame") && !binding) return
    markChanged(next)
    setSelectedId(added.id)
  }

  const changeSelected = (nextElement: LayoutElement) => {
    markChanged({
      ...schema,
      elements: schema.elements.map((element) =>
        element.id === nextElement.id ? nextElement : element
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

  const uploadDecorative = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    const body = new FormData()
    body.set("file", file)
    try {
      const uploaded = await api<{ id: string }>(`/api/projects/${project.id}/assets`, {
        method: "POST",
        body,
      })
      const next = addElement(schema, "decorative-image")
      const added = next.elements.at(-1)!
      if (added.type !== "decorative-image") return
      added.assetId = uploaded.id
      markChanged(next)
      setSelectedId(added.id)
      toast.success("Decorative image added")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed")
    }
  }

  return (
    <div
      className="grid min-h-[700px] gap-4 xl:grid-cols-[230px_minmax(0,1fr)_280px]"
      onKeyDown={(event) => {
        const activeObject = canvas.current?.getActiveObject() as
          | { isEditing?: boolean }
          | undefined
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
      <Card className="h-fit bg-card/90 xl:sticky xl:top-20">
        <CardHeader>
          <CardTitle>Layers</CardTitle>
          <CardDescription>Topmost first</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-72 xl:max-h-[580px]">
            <div className="flex flex-col gap-1 pr-2">
              {[...schema.elements].reverse().map((element) => (
                <Button
                  key={element.id}
                  type="button"
                  variant={selectedId === element.id ? "secondary" : "ghost"}
                  className="h-auto justify-start text-left"
                  onClick={() => setSelectedId(element.id)}
                >
                  <LayersIcon data-icon="inline-start" />
                  <span className="truncate">
                    {elementLabel(element, project.formSchema.questions)}
                  </span>
                </Button>
              ))}
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
          <CardContent className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => add("bound-text")}
              disabled={!textQuestion}
            >
              <TypeIcon data-icon="inline-start" />
              Answer text
            </Button>
            <Button variant="outline" size="sm" onClick={() => add("static-text")}>
              <TypeIcon data-icon="inline-start" />
              Static text
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => add("image-frame")}
              disabled={!imageQuestion}
            >
              <ImageIcon data-icon="inline-start" />
              Image
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => add("gallery-frame")}
              disabled={!imageQuestion}
            >
              <GalleryHorizontalIcon data-icon="inline-start" />
              Gallery
            </Button>
            <IconAction label="Add rectangle">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => add("rectangle")}
                aria-label="Add rectangle"
              >
                <RectangleHorizontalIcon />
              </Button>
            </IconAction>
            <IconAction label="Add circle">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => add("circle")}
                aria-label="Add circle"
              >
                <CircleIcon />
              </Button>
            </IconAction>
            <IconAction label="Add line">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => add("line")}
                aria-label="Add line"
              >
                <MinusIcon />
              </Button>
            </IconAction>
            <label className="inline-flex">
              <input
                type="file"
                className="sr-only"
                accept=".jpg,.jpeg,.png,.webp,.heif,.heic,image/*"
                onChange={uploadDecorative}
              />
              <span className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 text-sm font-medium hover:bg-muted focus-within:ring-3 focus-within:ring-ring/50">
                <ImagePlusIcon aria-hidden="true" />
                Decor
              </span>
            </label>
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
            <IconAction label="Redo" disabled={historyIndex.current >= history.current.length - 1}>
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
          </CardContent>
        </Card>

        {selected && (
          <Card className="mb-4 bg-card/90">
            <CardContent className="flex flex-wrap items-center gap-1">
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
            </CardContent>
          </Card>
        )}

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
          />
        </div>
      </div>

      <Card className="h-fit bg-card/90 xl:sticky xl:top-20">
        <CardHeader>
          <CardTitle>Inspector</CardTitle>
          <CardAction>
            <SaveIndicator state={saveState} />
          </CardAction>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[650px] pr-3">
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
  const selected = project.layouts.find((layout) => layout.id === selectedId) ?? project.layouts[0]

  useEffect(() => {
    if (selectedId && !project.layouts.some((layout) => layout.id === selectedId)) {
      setSelectedId(project.layouts[0]?.id ?? null)
    }
  }, [project.layouts, selectedId])

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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h2 className="font-heading text-2xl">Page layouts</h2>
          <p className="text-sm text-muted-foreground">
            Canonical millimetre geometry powers Fabric interaction and final rendering.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            items={project.layouts.map((layout) => ({
              label: layout.name,
              value: layout.id,
            }))}
            value={selected?.id}
            onValueChange={(value) => {
              if (value) setSelectedId(value)
            }}
          >
            <SelectTrigger className="w-56" aria-label="Choose a layout">
              <SelectValue placeholder="Choose a layout" />
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
          <Button
            onClick={async () => {
              try {
                const layout = await projectApi.layoutAction<LayoutRecord>(project.id, {
                  action: "create",
                  name: `Layout ${project.layouts.length + 1}`,
                })
                updateLayouts([...project.layouts, layout])
                setSelectedId(layout.id)
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Create failed")
              }
            }}
          >
            <PlusIcon data-icon="inline-start" />
            New layout
          </Button>
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
                Duplicate
              </Button>
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="outline" />}>
                  <Trash2Icon data-icon="inline-start" />
                  Delete
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this layout?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Referenced layouts cannot be deleted until generated page assignments are
                      resolved.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={async () => {
                        try {
                          await projectApi.deleteLayout(project.id, selected.id)
                          updateLayouts(
                            project.layouts
                              .filter((layout) => layout.id !== selected.id)
                              .map((layout, position) => ({
                                ...layout,
                                position,
                              }))
                          )
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Delete failed")
                        }
                      }}
                    >
                      Delete layout
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
