import { Canvas, FabricObject, IText, Rect, Textbox } from "fabric"
import { useEffect, useRef, useState, type RefObject } from "react"

import { LayoutPageElements } from "#/components/layout-page.tsx"
import { boundTextLabel } from "#/domain/layout-label.ts"
import { PAGE_SPEC } from "#/domain/layout.ts"
import { canonicalToMediaGeometry, mediaToCanonicalGeometry } from "#/domain/layout-rendering.ts"
import {
  type FormQuestion,
  type LayoutElement,
  type LayoutSchema,
  type RelativeGeometry,
  type SubmissionSummary,
} from "#/domain/types.ts"

type SakekeepObject = FabricObject & {
  sakekeepElementId?: string
  sakekeepConfiguredHeight?: number
  sakekeepOriginalText?: string
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
        ? {
            ...candidate,
            showLabel: content.trim().length > 0,
            label: content,
          }
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

function objectForElement(
  element: LayoutElement,
  canvasWidth: number,
  questions: FormQuestion[]
): SakekeepObject {
  const geometry = canonicalToCanvasGeometry(element.geometry, canvasWidth)
  const common = {
    left: geometry.x,
    top: geometry.y,
    width: geometry.width,
    height: geometry.height,
    angle: geometry.rotation,
    fill: "transparent",
    stroke: "transparent",
    strokeWidth: 0,
    opacity: element.type === "bound-text" ? 1 : 0,
    lockMovementX: element.locked,
    lockMovementY: element.locked,
    lockRotation: element.locked,
    lockScalingX: element.locked,
    lockScalingY: element.locked,
    objectCaching: false,
  }
  const editableText =
    element.type === "static-text"
      ? element.content
      : element.type === "bound-text"
        ? boundTextLabel(
            element,
            questions.find((question) => question.id === element.questionId)
          ) || "Add label…"
        : null
  const object: SakekeepObject =
    editableText !== null && (element.type === "static-text" || element.type === "bound-text")
      ? new Textbox(editableText, {
          ...common,
          editable: true,
          fontFamily: element.text.fontFamily,
          fontSize: element.text.fontSize * 0.3528 * (canvasWidth / PAGE_SPEC.mediaWidthMm),
          fontStyle: element.text.fontStyle,
          fontWeight: element.text.fontWeight,
          textAlign: element.text.alignment,
          lineHeight: element.text.lineHeight,
          fill: element.type === "bound-text" ? "transparent" : element.text.color,
        })
      : new Rect(common)
  object.sakekeepElementId = element.id
  if (element.type === "bound-text") {
    object.set({ height: geometry.height })
    object.sakekeepConfiguredHeight = geometry.height
  }
  object.set({
    name: `${elementName(element)} · ${element.id.slice(0, 5)}`,
  })
  return object
}

function geometryFromObject(object: FabricObject, canvasWidth: number): RelativeGeometry {
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
}) {
  const element = useRef<HTMLCanvasElement>(null)
  const instance = useRef<Canvas | null>(null)
  const schemaRef = useRef(schema)
  const onSelectRef = useRef(onSelect)
  const onChangeRef = useRef(onChange)
  const changing = useRef(false)
  const cancelledEdit = useRef<string | null>(null)
  const [displaySchema, setDisplaySchema] = useState(schema)
  const [editingElementId, setEditingElementId] = useState<string>()
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
    const modified = (event: { target?: FabricObject; transform?: { action?: string } }) => {
      if (event.target instanceof IText && !event.transform?.action) return
      const next = schemaWithObjectGeometry(event)
      if (!next) return
      setDisplaySchema(next)
      changing.current = true
      onChangeRef.current(next)
      requestAnimationFrame(() => {
        changing.current = false
      })
    }
    const textEdited = (event: { target: IText }) => {
      const object = event.target as IText & SakekeepObject
      if (!object.sakekeepElementId) return
      const source = schemaRef.current.elements.find(
        (candidate) => candidate.id === object.sakekeepElementId
      )
      object.set({
        opacity: source?.type === "bound-text" ? 1 : 0,
        fill: source?.type === "bound-text" ? "transparent" : object.fill,
        height: object.sakekeepConfiguredHeight ?? object.height,
      })
      object.setCoords()
      setEditingElementId(undefined)
      if (cancelledEdit.current === object.sakekeepElementId) {
        cancelledEdit.current = null
        setDisplaySchema(schemaRef.current)
        canvas.requestRenderAll()
        return
      }
      const question =
        source?.type === "bound-text"
          ? questions.find((candidate) => candidate.id === source.questionId)
          : undefined
      const next =
        source?.type === "bound-text"
          ? applyInlineBoundLabelEdit(
              schemaRef.current,
              object.sakekeepElementId,
              object.text,
              boundTextLabel(source, question)
            )
          : applyInlineStaticTextEdit(schemaRef.current, object.sakekeepElementId, object.text)
      if (!next) {
        setDisplaySchema(schemaRef.current)
        canvas.requestRenderAll()
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
    const startInlineEditing = (event?: Parameters<IText["enterEditing"]>[0]) => {
      const object = canvas.getActiveObject() as (IText & SakekeepObject) | undefined
      const source = schemaRef.current.elements.find(
        (candidate) => candidate.id === object?.sakekeepElementId
      )
      if (!object || (source?.type !== "static-text" && source?.type !== "bound-text")) {
        return false
      }
      const alreadyEditing = object.isEditing
      const question =
        source.type === "bound-text"
          ? questions.find((candidate) => candidate.id === source.questionId)
          : undefined
      const content =
        source.type === "static-text" ? source.content : boundTextLabel(source, question)
      object.sakekeepOriginalText = content
      setEditingElementId(source.id)
      setDisplaySchema({
        ...schemaRef.current,
        elements: schemaRef.current.elements.map((candidate) => {
          if (candidate.id !== source.id) return candidate
          return candidate.type === "static-text"
            ? { ...candidate, content: "" }
            : candidate.type === "bound-text"
              ? { ...candidate, showLabel: false }
              : candidate
        }),
      })
      object.set({ text: content, opacity: source.opacity, fill: source.text.color })
      canvas.setActiveObject(object)
      if (!alreadyEditing) object.enterEditing(event)
      object.selectAll()
      canvas.requestRenderAll()
      return true
    }
    const editableCanvas = canvas as InlineEditableCanvas
    editableCanvas.startInlineEditing = () => startInlineEditing()
    const keyDown = (event: KeyboardEvent) => {
      const object = canvas.getActiveObject() as (IText & SakekeepObject) | undefined
      if (!object?.isEditing || !object.sakekeepElementId || event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      cancelledEdit.current = object.sakekeepElementId
      object.set({
        text: object.sakekeepOriginalText ?? "",
        height: object.sakekeepConfiguredHeight ?? object.height,
      })
      object.setCoords()
      object.exitEditing()
      canvas.requestRenderAll()
    }
    const pointerDown = (event: PointerEvent) => {
      const object = canvas.getActiveObject() as (IText & SakekeepObject) | undefined
      const target = event.target
      if (
        !object?.isEditing ||
        !(target instanceof Element) ||
        target.closest(".canvas-container")
      ) {
        return
      }
      object.exitEditing()
      canvas.requestRenderAll()
    }

    canvas.on("selection:created", select)
    canvas.on("selection:updated", select)
    canvas.on("selection:cleared", select)
    canvas.on("object:moving", transforming)
    canvas.on("object:scaling", transforming)
    canvas.on("object:rotating", transforming)
    canvas.on("object:modified", modified)
    const doubleClick = (event: MouseEvent) => {
      const bounds = canvas.upperCanvasEl.getBoundingClientRect()
      const pointer = {
        x: ((event.clientX - bounds.left) / bounds.width) * width,
        y:
          ((event.clientY - bounds.top) / bounds.height) *
          width *
          (PAGE_SPEC.mediaHeightMm / PAGE_SPEC.mediaWidthMm),
      }
      const hitElement = [...schemaRef.current.elements].reverse().find((candidate) => {
        if (candidate.type !== "bound-text" && candidate.type !== "static-text") return false
        return geometryContainsPoint(
          canonicalToCanvasGeometry(candidate.geometry, width),
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
      startInlineEditing(event)
    }
    canvas.upperCanvasEl.addEventListener("dblclick", doubleClick, true)
    canvas.on("text:editing:exited", textEdited)
    window.addEventListener("keydown", keyDown, true)
    window.addEventListener("pointerdown", pointerDown, true)

    return () => {
      window.removeEventListener("keydown", keyDown, true)
      window.removeEventListener("pointerdown", pointerDown, true)
      canvas.upperCanvasEl.removeEventListener("dblclick", doubleClick, true)
      delete editableCanvas.startInlineEditing
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
    const activeObject = canvas.getActiveObject()
    if (activeObject instanceof IText && activeObject.isEditing) return
    const objects = schema.elements.map((item) => objectForElement(item, width, questions))
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

  return (
    <div
      className="relative overflow-hidden rounded-lg bg-background shadow-2xl ring-1 ring-foreground/15"
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
        }}
        testId="editor-layout-elements"
        ariaHidden
        showEditorPlaceholders
        editingElementId={editingElementId}
      />
      <canvas ref={element} aria-label="Visual DIN A5 landscape layout canvas" />
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
