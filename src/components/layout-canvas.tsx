import { Canvas, FabricObject, Rect } from "fabric"
import { useEffect, useRef, useState, type DragEvent, type RefObject } from "react"

import { LayoutPageElements, textElementStyle } from "#/components/layout-page.tsx"
import { PAGE_SPEC } from "#/domain/layout.ts"
import { canonicalToMediaGeometry, mediaToCanonicalGeometry } from "#/domain/layout-rendering.ts"
import {
  type FormQuestion,
  type LayoutElement,
  type LayoutSchema,
  type RelativeGeometry,
  type SubmissionSummary,
} from "#/domain/types.ts"
import { cn } from "#/lib/utils.ts"

export const LAYOUT_ELEMENT_DRAG_TYPE = "application/x-sakekeep-layout-element"

export interface LayoutElementDragData {
  type: LayoutElement["type"]
  questionId?: string
}

const layoutElementTypes = new Set<LayoutElement["type"]>([
  "bound-text",
  "static-text",
  "image-frame",
  "gallery-frame",
  "rectangle",
  "circle",
  "line",
  "decorative-image",
])

export function parseLayoutElementDragData(value: string): LayoutElementDragData | null {
  try {
    const data: unknown = JSON.parse(value)
    if (!data || typeof data !== "object" || !("type" in data)) return null
    const type = data.type
    if (typeof type !== "string" || !layoutElementTypes.has(type as LayoutElement["type"])) {
      return null
    }
    const questionId = "questionId" in data ? data.questionId : undefined
    if (questionId !== undefined && typeof questionId !== "string") return null
    return { type: type as LayoutElement["type"], questionId }
  } catch {
    return null
  }
}

type SakekeepObject = FabricObject & { sakekeepElementId?: string }

export function applyInlineStaticTextEdit(
  schema: LayoutSchema,
  elementId: string,
  content: string
): LayoutSchema | null {
  const element = schema.elements.find((candidate) => candidate.id === elementId)
  if (element?.type !== "static-text" || element.content === content) return null
  return {
    ...schema,
    elements: schema.elements.map((candidate) =>
      candidate.id === elementId && candidate.type === "static-text"
        ? { ...candidate, content }
        : candidate
    ),
  }
}

export function canonicalToCanvasGeometry(
  geometry: RelativeGeometry,
  canvasWidth: number
): RelativeGeometry {
  return canonicalToMediaGeometry(geometry, canvasWidth)
}

export function canvasToCanonicalGeometry(
  geometry: RelativeGeometry,
  canvasWidth: number
): RelativeGeometry {
  return mediaToCanonicalGeometry(geometry, canvasWidth)
}

function elementName(element: LayoutElement) {
  const names: Record<LayoutElement["type"], string> = {
    "bound-text": "Question text",
    "static-text": "Static text",
    "image-frame": "Image frame",
    "gallery-frame": "Gallery",
    rectangle: "Rectangle",
    circle: "Circle",
    line: "Line",
    "decorative-image": "Decorative image",
  }
  return names[element.type]
}

function InlineStaticTextEditor({
  element,
  onCommit,
}: {
  element: Extract<LayoutElement, { type: "static-text" }>
  onCommit: (content: string) => void
}) {
  const editor = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = editor.current
    if (!node) return
    node.focus()
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(node)
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, [])

  return (
    <div
      ref={editor}
      data-layout-element-id={element.id}
      data-layout-element-type={element.type}
      data-layout-inline-editor="true"
      contentEditable
      suppressContentEditableWarning
      onBlur={(event) => onCommit(event.currentTarget.innerText)}
      style={{
        ...textElementStyle(element),
        zIndex: 2,
        cursor: "text",
        outline: "2px solid var(--primary)",
      }}
    >
      {element.content}
    </div>
  )
}

export function objectForElement(element: LayoutElement, canvasWidth: number): SakekeepObject {
  const geometry = canonicalToCanvasGeometry(element.geometry, canvasWidth)
  const common = {
    left: geometry.x,
    top: geometry.y,
    width: geometry.width,
    height: geometry.height,
    angle: geometry.rotation,
    originX: "left" as const,
    originY: "top" as const,
    fill: "transparent",
    stroke: "transparent",
    strokeWidth: 0,
    opacity: 0,
    lockMovementX: element.locked,
    lockMovementY: element.locked,
    lockRotation: element.locked,
    lockScalingX: element.locked,
    lockScalingY: element.locked,
    objectCaching: false,
  }
  const object: SakekeepObject = new Rect(common)
  object.sakekeepElementId = element.id
  object.set({
    name: `${elementName(element)} · ${element.id.slice(0, 5)}`,
  })
  return object
}

export function geometryFromObject(object: FabricObject, canvasWidth: number): RelativeGeometry {
  return canvasToCanonicalGeometry(
    {
      x: object.left ?? 0,
      y: object.top ?? 0,
      width: object.getScaledWidth(),
      height: object.getScaledHeight(),
      rotation: object.angle ?? 0,
    },
    canvasWidth
  )
}

export function LayoutCanvas({
  schema,
  width,
  selectedId,
  onSelect,
  onChange,
  canvasRef,
  questions = [],
  previewSubmission,
  decorativeAssetUrl,
  showGuides = true,
  onDropElement,
}: {
  schema: LayoutSchema
  width: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  onChange: (schema: LayoutSchema) => void
  canvasRef?: RefObject<Canvas | null>
  questions?: FormQuestion[]
  previewSubmission?: SubmissionSummary
  decorativeAssetUrl?: (assetId: string) => string
  showGuides?: boolean
  onDropElement?: (data: LayoutElementDragData, center: { x: number; y: number }) => void
}) {
  const element = useRef<HTMLCanvasElement>(null)
  const instance = useRef<Canvas | null>(null)
  const schemaRef = useRef(schema)
  const onSelectRef = useRef(onSelect)
  const onChangeRef = useRef(onChange)
  const changing = useRef(false)
  const [displaySchema, setDisplaySchema] = useState(schema)
  const [editingElementId, setEditingElementId] = useState<string | null>(null)
  const [isDropTarget, setIsDropTarget] = useState(false)
  schemaRef.current = schema
  onSelectRef.current = onSelect
  onChangeRef.current = onChange

  useEffect(() => {
    if (!element.current || width <= 0) return
    const canvas = new Canvas(element.current, {
      width,
      height: width * (PAGE_SPEC.mediaHeightMm / PAGE_SPEC.mediaWidthMm),
      preserveObjectStacking: true,
      selection: true,
      backgroundColor: "transparent",
    })
    instance.current = canvas
    if (canvasRef) canvasRef.current = canvas

    const select = () => {
      const object = canvas.getActiveObject() as SakekeepObject | undefined
      onSelectRef.current(object?.sakekeepElementId ?? null)
    }
    const schemaWithObjectGeometry = (event: { target?: FabricObject }) => {
      const object = event.target as SakekeepObject | undefined
      if (!object?.sakekeepElementId) return null
      return {
        ...schemaRef.current,
        elements: schemaRef.current.elements.map((candidate) =>
          candidate.id === object.sakekeepElementId
            ? {
                ...candidate,
                geometry: geometryFromObject(object, width),
              }
            : candidate
        ),
      }
    }
    const transforming = (event: { target?: FabricObject }) => {
      const next = schemaWithObjectGeometry(event)
      if (next) setDisplaySchema(next)
    }
    const modified = (event: { target?: FabricObject }) => {
      const next = schemaWithObjectGeometry(event)
      if (!next) return
      setDisplaySchema(next)
      changing.current = true
      onChangeRef.current(next)
      requestAnimationFrame(() => {
        changing.current = false
      })
    }
    canvas.on("selection:created", select)
    canvas.on("selection:updated", select)
    canvas.on("selection:cleared", select)
    canvas.on("object:moving", transforming)
    canvas.on("object:scaling", transforming)
    canvas.on("object:rotating", transforming)
    canvas.on("object:modified", modified)
    canvas.on("mouse:dblclick", (event) => {
      const object = event.target as SakekeepObject | undefined
      const source = schemaRef.current.elements.find(
        (candidate) => candidate.id === object?.sakekeepElementId
      )
      if (!object || source?.type !== "static-text") return
      setDisplaySchema({
        ...schemaRef.current,
        elements: schemaRef.current.elements.map((candidate) =>
          candidate.id === source.id ? { ...source, content: "" } : candidate
        ),
      })
      setEditingElementId(source.id)
      canvas.requestRenderAll()
    })

    return () => {
      if (canvasRef) canvasRef.current = null
      instance.current = null
      canvas.dispose()
    }
  }, [canvasRef, width])

  useEffect(() => {
    setDisplaySchema(schema)
  }, [schema])

  useEffect(() => {
    const canvas = instance.current
    if (!canvas || changing.current) return
    const objects = schema.elements.map((item) => objectForElement(item, width))
    canvas.clear()
    canvas.backgroundColor = "transparent"
    canvas.add(...objects)
    const selected = selectedId
      ? objects.find((object) => object.sakekeepElementId === selectedId)
      : undefined
    if (selectedId) {
      if (selected) canvas.setActiveObject(selected)
    }
    if (element.current) {
      if (selected) {
        element.current.dataset.selectedElementOpacity = String(
          schema.elements.find((item) => item.id === selectedId)?.opacity ?? 1
        )
      } else {
        delete element.current.dataset.selectedElementOpacity
      }
    }
    canvas.requestRenderAll()
  }, [schema, selectedId, width])

  const editingElement = editingElementId
    ? schema.elements.find(
        (candidate): candidate is Extract<LayoutElement, { type: "static-text" }> =>
          candidate.id === editingElementId && candidate.type === "static-text"
      )
    : undefined

  const commitInlineEdit = (content: string) => {
    if (!editingElementId) return
    setEditingElementId(null)
    const next = applyInlineStaticTextEdit(schemaRef.current, editingElementId, content)
    if (!next) {
      setDisplaySchema(schemaRef.current)
      return
    }
    schemaRef.current = next
    setDisplaySchema(next)
    changing.current = true
    onChangeRef.current(next)
    requestAnimationFrame(() => {
      changing.current = false
    })
  }

  const acceptsPaletteDrop = (event: DragEvent<HTMLDivElement>) =>
    event.dataTransfer.types.includes(LAYOUT_ELEMENT_DRAG_TYPE)

  const dropElement = (event: DragEvent<HTMLDivElement>) => {
    setIsDropTarget(false)
    if (!onDropElement || !acceptsPaletteDrop(event)) return
    event.preventDefault()
    const data = parseLayoutElementDragData(event.dataTransfer.getData(LAYOUT_ELEMENT_DRAG_TYPE))
    if (!data) return
    const bounds = event.currentTarget.getBoundingClientRect()
    onDropElement(data, {
      x:
        ((event.clientX - bounds.left) / bounds.width) * PAGE_SPEC.mediaWidthMm - PAGE_SPEC.bleedMm,
      y:
        ((event.clientY - bounds.top) / bounds.height) * PAGE_SPEC.mediaHeightMm -
        PAGE_SPEC.bleedMm,
    })
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg bg-background shadow-2xl ring-1 ring-foreground/15",
        isDropTarget && "ring-3 ring-primary"
      )}
      data-layout-drop-target={isDropTarget || undefined}
      data-layout-canvas
      onDragEnter={(event) => {
        if (!onDropElement || !acceptsPaletteDrop(event)) return
        event.preventDefault()
        setIsDropTarget(true)
      }}
      onDragOver={(event) => {
        if (!onDropElement || !acceptsPaletteDrop(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = "copy"
        setIsDropTarget(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsDropTarget(false)
        }
      }}
      onDrop={dropElement}
      style={{
        width,
        height: width * (PAGE_SPEC.mediaHeightMm / PAGE_SPEC.mediaWidthMm),
        background: displaySchema.background,
        containerType: "inline-size",
      }}
    >
      <LayoutPageElements
        schema={displaySchema}
        content={{
          questions,
          submission: previewSubmission,
          decorativeAssetUrl,
          decorativePlaceholderUrl: "/layout-decorative-placeholder.svg",
        }}
        testId="editor-layout-elements"
        ariaHidden
      />
      <canvas ref={element} aria-label="Visual DIN A5 landscape layout canvas" />
      {editingElement && (
        <InlineStaticTextEditor element={editingElement} onCommit={commitInlineEdit} />
      )}
      {showGuides && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute border border-dashed border-primary/70"
            style={{
              left: `${(3 / 216) * 100}%`,
              top: `${(3 / 154) * 100}%`,
              width: `${(210 / 216) * 100}%`,
              height: `${(148 / 154) * 100}%`,
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute border border-dotted border-primary/45"
            style={{
              left: `${(9 / 216) * 100}%`,
              top: `${(9 / 154) * 100}%`,
              width: `${(198 / 216) * 100}%`,
              height: `${(136 / 154) * 100}%`,
            }}
          />
          <div className="pointer-events-none absolute top-2 left-2 rounded bg-background/85 px-2 py-1 text-[10px] text-muted-foreground">
            bleed · trim · safe
          </div>
        </>
      )}
    </div>
  )
}
