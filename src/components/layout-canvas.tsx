import { Canvas, FabricObject, Rect } from "fabric"
import { useEffect, useRef, useState, type DragEvent, type RefObject } from "react"

import {
  LayoutPageElements,
  textElementStyle,
  textElementVerticalOffsetMm,
  type LayoutPageContent,
} from "#/components/layout-page.tsx"
import { boundTextLabel } from "#/domain/layout-label.ts"
import { PAGE_SPEC } from "#/domain/layout.ts"
import { canonicalToMediaGeometry, mediaToCanonicalGeometry } from "#/domain/layout-rendering.ts"
import { pageSpecificationForLayout, type PageSpecification } from "#/domain/page-format.ts"
import { enforceMinimumTextBoxHeight } from "#/domain/text-layout.ts"
import {
  type FormQuestion,
  type LayoutElement,
  type LayoutSchema,
  type RelativeGeometry,
  type SubmissionSummary,
} from "#/domain/types.ts"
import { captureAnalyticsEvent } from "#/lib/analytics.ts"
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

type SakekeepObject = FabricObject & {
  sakekeepElementId?: string
}

export type InlineEditableCanvas = Canvas & {
  startInlineEditing?: () => boolean
}

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

export function applyInlineBoundLabelEdit(
  schema: LayoutSchema,
  elementId: string,
  content: string,
  currentLabel: string
): LayoutSchema | null {
  const element = schema.elements.find((candidate) => candidate.id === elementId)
  if (element?.type !== "bound-text" || currentLabel === content) return null
  return {
    ...schema,
    elements: schema.elements.map((candidate) =>
      candidate.id === elementId && candidate.type === "bound-text"
        ? enforceMinimumTextBoxHeight(
            {
              ...candidate,
              showLabel: content.trim().length > 0,
              label: content,
            },
            content
          )
        : candidate
    ),
  }
}

export function canonicalToCanvasGeometry(
  geometry: RelativeGeometry,
  canvasWidth: number,
  specification: PageSpecification = PAGE_SPEC
): RelativeGeometry {
  return canonicalToMediaGeometry(geometry, canvasWidth, specification)
}

export function canvasToCanonicalGeometry(
  geometry: RelativeGeometry,
  canvasWidth: number,
  specification: PageSpecification = PAGE_SPEC
): RelativeGeometry {
  return mediaToCanonicalGeometry(geometry, canvasWidth, specification)
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

function InlineTextEditor({
  element,
  content,
  editedText,
  pageContent,
  onEdit,
  onCommit,
  onCancel,
  specification,
}: {
  element: Extract<LayoutElement, { type: "static-text" | "bound-text" }>
  content: string
  editedText: string
  pageContent: LayoutPageContent
  onEdit: (content: string) => void
  onCommit: (content: string) => void
  onCancel: () => void
  specification: PageSpecification
}) {
  const editor = useRef<HTMLDivElement>(null)
  const cancelled = useRef(false)
  const offsetYMm = textElementVerticalOffsetMm(element, pageContent, editedText)

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
      onInput={(event) => onEdit(event.currentTarget.innerText)}
      onBlur={(event) => {
        if (!cancelled.current) onCommit(event.currentTarget.innerText)
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return
        event.preventDefault()
        event.stopPropagation()
        cancelled.current = true
        onCancel()
      }}
      style={{
        ...textElementStyle(element, element.text.fontSize, specification, offsetYMm),
        zIndex: 2,
        cursor: "text",
        fontWeight: element.type === "bound-text" ? "bold" : element.text.fontWeight,
        outline: "2px solid var(--primary)",
      }}
    >
      {content}
    </div>
  )
}

export function objectForElement(
  element: LayoutElement,
  canvasWidth: number,
  specification: PageSpecification = PAGE_SPEC
): SakekeepObject {
  const geometry = canonicalToCanvasGeometry(element.geometry, canvasWidth, specification)
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

export function geometryFromObject(
  object: FabricObject,
  canvasWidth: number,
  specification: PageSpecification = PAGE_SPEC
): RelativeGeometry {
  return canvasToCanonicalGeometry(
    {
      x: object.left ?? 0,
      y: object.top ?? 0,
      width: object.getScaledWidth(),
      height: object.getScaledHeight(),
      rotation: object.angle ?? 0,
    },
    canvasWidth,
    specification
  )
}

function geometryContainsPoint(geometry: RelativeGeometry, x: number, y: number): boolean {
  const angle = (-geometry.rotation * Math.PI) / 180
  const offsetX = x - geometry.x
  const offsetY = y - geometry.y
  const localX = offsetX * Math.cos(angle) - offsetY * Math.sin(angle)
  const localY = offsetX * Math.sin(angle) + offsetY * Math.cos(angle)
  return localX >= 0 && localX <= geometry.width && localY >= 0 && localY <= geometry.height
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
  const specification = pageSpecificationForLayout(schema)
  const element = useRef<HTMLCanvasElement>(null)
  const instance = useRef<Canvas | null>(null)
  const schemaRef = useRef(schema)
  const onSelectRef = useRef(onSelect)
  const onChangeRef = useRef(onChange)
  const changing = useRef(false)
  const editMethod = useRef<"double_click" | "keyboard">("keyboard")
  const [displaySchema, setDisplaySchema] = useState(schema)
  const [editingElementId, setEditingElementId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState("")
  const [isDropTarget, setIsDropTarget] = useState(false)
  schemaRef.current = schema
  onSelectRef.current = onSelect
  onChangeRef.current = onChange

  useEffect(() => {
    if (!element.current || width <= 0) return
    const canvas = new Canvas(element.current, {
      width,
      height: width * (specification.mediaHeightMm / specification.mediaWidthMm),
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
    const schemaWithObjectGeometry = (
      event: { target?: FabricObject },
      enforceMinimumHeight = false
    ) => {
      const object = event.target as SakekeepObject | undefined
      if (!object?.sakekeepElementId) return null
      return {
        ...schemaRef.current,
        elements: schemaRef.current.elements.map((candidate) => {
          if (candidate.id !== object.sakekeepElementId) return candidate
          let geometry = geometryFromObject(object, width, specification)
          if (enforceMinimumHeight) {
            const question =
              candidate.type === "bound-text"
                ? questions.find((item) => item.id === candidate.questionId)
                : undefined
            const label = candidate.type === "bound-text" ? boundTextLabel(candidate, question) : ""
            const constrained = enforceMinimumTextBoxHeight({ ...candidate, geometry }, label)
            if (constrained.geometry.height > geometry.height) {
              object.set({
                scaleY: (object.scaleY ?? 1) * (constrained.geometry.height / geometry.height),
              })
              object.setCoords()
              geometry = geometryFromObject(object, width, specification)
            }
          }
          return { ...candidate, geometry }
        }),
      }
    }
    const transforming = (event: { target?: FabricObject }) => {
      const next = schemaWithObjectGeometry(event)
      if (next) setDisplaySchema(next)
    }
    const modified = (event: { target?: FabricObject; transform?: { action?: string } }) => {
      const next = schemaWithObjectGeometry(event, event.transform?.action?.startsWith("scale"))
      if (!next) return
      setDisplaySchema(next)
      changing.current = true
      onChangeRef.current(next)
      requestAnimationFrame(() => {
        changing.current = false
      })
    }
    const startInlineEditing = (inputMethod: "double_click" | "keyboard") => {
      const object = canvas.getActiveObject() as SakekeepObject | undefined
      const source = schemaRef.current.elements.find(
        (candidate) => candidate.id === object?.sakekeepElementId
      )
      if (!object || (source?.type !== "static-text" && source?.type !== "bound-text")) {
        return false
      }
      canvas.setActiveObject(object)
      editMethod.current = inputMethod
      setEditingElementId(source.id)
      setEditingText(
        source.type === "static-text"
          ? source.content
          : boundTextLabel(
              source,
              questions.find((candidate) => candidate.id === source.questionId)
            )
      )
      if (source.type === "static-text") {
        setDisplaySchema({
          ...schemaRef.current,
          elements: schemaRef.current.elements.map((candidate) =>
            candidate.id === source.id ? { ...source, content: "" } : candidate
          ),
        })
        canvas.requestRenderAll()
        return true
      }
      setDisplaySchema({
        ...schemaRef.current,
        elements: schemaRef.current.elements.map((candidate) =>
          candidate.id === source.id ? { ...source, showLabel: false } : candidate
        ),
      })
      canvas.requestRenderAll()
      return true
    }
    const editableCanvas = canvas as InlineEditableCanvas
    editableCanvas.startInlineEditing = () => startInlineEditing("keyboard")
    canvas.on("selection:created", select)
    canvas.on("selection:updated", select)
    canvas.on("selection:cleared", select)
    canvas.on("object:moving", transforming)
    canvas.on("object:scaling", (event) => {
      const next = schemaWithObjectGeometry(event, true)
      if (next) setDisplaySchema(next)
    })
    canvas.on("object:rotating", transforming)
    canvas.on("object:modified", modified)
    const doubleClick = (event: MouseEvent) => {
      const bounds = canvas.upperCanvasEl.getBoundingClientRect()
      const pointer = {
        x: ((event.clientX - bounds.left) / bounds.width) * width,
        y:
          ((event.clientY - bounds.top) / bounds.height) *
          width *
          (specification.mediaHeightMm / specification.mediaWidthMm),
      }
      const hitElement = [...schemaRef.current.elements].reverse().find((candidate) => {
        if (candidate.type !== "bound-text" && candidate.type !== "static-text") return false
        return geometryContainsPoint(
          canonicalToCanvasGeometry(candidate.geometry, width, specification),
          pointer.x,
          pointer.y
        )
      })
      const object = hitElement
        ? (canvas
            .getObjects()
            .find(
              (candidate) => (candidate as SakekeepObject).sakekeepElementId === hitElement.id
            ) as SakekeepObject | undefined)
        : undefined
      if (!object) return
      event.stopImmediatePropagation()
      canvas.setActiveObject(object)
      startInlineEditing("double_click")
    }
    canvas.upperCanvasEl.addEventListener("dblclick", doubleClick, true)

    return () => {
      canvas.upperCanvasEl.removeEventListener("dblclick", doubleClick, true)
      delete editableCanvas.startInlineEditing
      if (canvasRef) canvasRef.current = null
      instance.current = null
      canvas.dispose()
    }
  }, [canvasRef, questions, specification.mediaHeightMm, specification.mediaWidthMm, width])

  useEffect(() => {
    setDisplaySchema(schema)
  }, [schema])

  useEffect(() => {
    const canvas = instance.current
    if (!canvas || changing.current) return
    const objects = schema.elements.map((item) => objectForElement(item, width, specification))
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
  }, [questions, schema, selectedId, specification.mediaWidthMm, width])

  const pageContent: LayoutPageContent = {
    questions,
    submission: previewSubmission,
    decorativeAssetUrl,
    decorativePlaceholderUrl: "/layout-decorative-placeholder.svg",
  }

  const editingElement = editingElementId
    ? schema.elements.find(
        (candidate): candidate is Extract<LayoutElement, { type: "static-text" | "bound-text" }> =>
          candidate.id === editingElementId &&
          (candidate.type === "static-text" || candidate.type === "bound-text")
      )
    : undefined

  const commitInlineEdit = (content: string) => {
    if (!editingElementId) return
    setEditingElementId(null)
    const source = schemaRef.current.elements.find((candidate) => candidate.id === editingElementId)
    const next =
      source?.type === "bound-text"
        ? applyInlineBoundLabelEdit(
            schemaRef.current,
            editingElementId,
            content,
            boundTextLabel(
              source,
              questions.find((candidate) => candidate.id === source.questionId)
            )
          )
        : applyInlineStaticTextEdit(schemaRef.current, editingElementId, content)
    if (!next) {
      setDisplaySchema(schemaRef.current)
      return
    }
    if (source?.type === "bound-text") {
      captureAnalyticsEvent("layout_editor:answer_label_edit", {
        cleared: content.trim().length === 0,
        input_method: editMethod.current,
      })
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
        ((event.clientX - bounds.left) / bounds.width) * specification.mediaWidthMm -
        specification.bleedMm,
      y:
        ((event.clientY - bounds.top) / bounds.height) * specification.mediaHeightMm -
        specification.bleedMm,
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
        height: width * (specification.mediaHeightMm / specification.mediaWidthMm),
        background: displaySchema.background,
        containerType: "inline-size",
      }}
    >
      <LayoutPageElements
        schema={displaySchema}
        content={pageContent}
        testId="editor-layout-elements"
        ariaHidden
        showEditorPlaceholders
        editingElementId={editingElementId ?? undefined}
        editingText={editingElementId ? editingText : undefined}
      />
      <canvas
        ref={element}
        aria-label={`Visual DIN ${specification.format.toUpperCase()} ${specification.orientation} layout canvas`}
      />
      {editingElement && (
        <InlineTextEditor
          element={editingElement}
          editedText={editingText}
          pageContent={pageContent}
          onEdit={setEditingText}
          content={
            editingElement.type === "static-text"
              ? editingElement.content
              : boundTextLabel(
                  editingElement,
                  questions.find((candidate) => candidate.id === editingElement.questionId)
                )
          }
          onCommit={commitInlineEdit}
          onCancel={() => {
            setEditingElementId(null)
            setDisplaySchema(schemaRef.current)
          }}
          specification={specification}
        />
      )}
      {showGuides && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute border border-dashed border-primary/70"
            style={{
              left: `${(specification.bleedMm / specification.mediaWidthMm) * 100}%`,
              top: `${(specification.bleedMm / specification.mediaHeightMm) * 100}%`,
              width: `${(specification.trimWidthMm / specification.mediaWidthMm) * 100}%`,
              height: `${(specification.trimHeightMm / specification.mediaHeightMm) * 100}%`,
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute border border-dotted border-primary/45"
            style={{
              left: `${((specification.bleedMm + specification.safeMarginMm) / specification.mediaWidthMm) * 100}%`,
              top: `${((specification.bleedMm + specification.safeMarginMm) / specification.mediaHeightMm) * 100}%`,
              width: `${((specification.trimWidthMm - specification.safeMarginMm * 2) / specification.mediaWidthMm) * 100}%`,
              height: `${((specification.trimHeightMm - specification.safeMarginMm * 2) / specification.mediaHeightMm) * 100}%`,
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
