import { Canvas, Circle, FabricImage, FabricObject, IText, Line, Rect, Textbox } from "fabric"
import { useEffect, useRef, type RefObject } from "react"

import { PAGE_SPEC } from "#/domain/layout.ts"
import { type LayoutElement, type LayoutSchema, type RelativeGeometry } from "#/domain/types.ts"

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
  const scale = canvasWidth / PAGE_SPEC.mediaWidthMm
  return {
    x: (geometry.x + PAGE_SPEC.bleedMm) * scale,
    y: (geometry.y + PAGE_SPEC.bleedMm) * scale,
    width: geometry.width * scale,
    height: geometry.height * scale,
    rotation: geometry.rotation,
  }
}

export function canvasToCanonicalGeometry(
  geometry: RelativeGeometry,
  canvasWidth: number
): RelativeGeometry {
  const scale = PAGE_SPEC.mediaWidthMm / canvasWidth
  const round = (value: number) => Math.round(value * 10_000) / 10_000
  return {
    x: round(geometry.x * scale - PAGE_SPEC.bleedMm),
    y: round(geometry.y * scale - PAGE_SPEC.bleedMm),
    width: round(geometry.width * scale),
    height: round(geometry.height * scale),
    rotation: round(geometry.rotation),
  }
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

async function objectForElement(
  element: LayoutElement,
  canvasWidth: number
): Promise<SakekeepObject> {
  const geometry = canonicalToCanvasGeometry(element.geometry, canvasWidth)
  const common = {
    left: geometry.x,
    top: geometry.y,
    angle: geometry.rotation,
    opacity: element.opacity,
    lockMovementX: element.locked,
    lockMovementY: element.locked,
    lockRotation: element.locked,
    lockScalingX: element.locked,
    lockScalingY: element.locked,
    objectCaching: false,
  }
  let object: SakekeepObject
  if (element.type === "bound-text" || element.type === "static-text") {
    const content =
      element.type === "static-text"
        ? element.content
        : element.showLabel
          ? `${element.label || "Question"}\nAnswer preview`
          : "Answer preview"
    const scale = canvasWidth / PAGE_SPEC.mediaWidthMm
    object = new Textbox(content, {
      ...common,
      editable: element.type === "static-text",
      width: geometry.width,
      height: geometry.height,
      fontFamily: element.text.fontFamily,
      fontSize: element.text.fontSize * 0.3528 * scale,
      fontStyle: element.text.fontStyle,
      fontWeight: element.text.fontWeight,
      textAlign: element.text.alignment,
      lineHeight: element.text.lineHeight,
      fill: element.text.color,
    })
  } else if (element.type === "rectangle") {
    object = new Rect({
      ...common,
      width: geometry.width,
      height: geometry.height,
      fill: element.fill,
      stroke: element.stroke,
      strokeWidth: Math.max(0.5, element.strokeWidth),
    })
  } else if (element.type === "circle") {
    object = new Circle({
      ...common,
      radius: Math.min(geometry.width, geometry.height) / 2,
      scaleX: geometry.width / Math.min(geometry.width, geometry.height),
      scaleY: geometry.height / Math.min(geometry.width, geometry.height),
      fill: element.fill,
      stroke: element.stroke,
      strokeWidth: Math.max(0.5, element.strokeWidth),
    })
  } else if (element.type === "line") {
    object = new Line([0, 0, geometry.width, geometry.height], {
      ...common,
      fill: element.fill,
      stroke: element.stroke,
      strokeWidth: Math.max(1, element.strokeWidth),
    })
  } else if (element.type === "decorative-image" && element.assetId) {
    try {
      const image = await FabricImage.fromURL(`/api/assets/${element.assetId}?variant=preview`, {
        crossOrigin: "anonymous",
      })
      image.set({
        ...common,
        scaleX: geometry.width / (image.width || geometry.width),
        scaleY: geometry.height / (image.height || geometry.height),
      })
      object = image
    } catch {
      object = new Rect({
        ...common,
        width: geometry.width,
        height: geometry.height,
        fill: "#ddd6cc",
        stroke: "#7c7062",
        strokeDashArray: [6, 4],
      })
    }
  } else {
    const gallery = element.type === "gallery-frame"
    object = new Rect({
      ...common,
      width: geometry.width,
      height: geometry.height,
      fill: gallery ? "rgba(200,210,190,0.18)" : "rgba(210,200,190,0.15)",
      stroke: gallery ? "#5f765c" : "#7c7062",
      strokeWidth: 1.5,
      strokeDashArray: gallery ? [3, 3] : [8, 5],
    })
  }
  object.sakekeepElementId = element.id
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

export function LayoutCanvas({
  schema,
  width,
  selectedId,
  onSelect,
  onChange,
  canvasRef,
}: {
  schema: LayoutSchema
  width: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  onChange: (schema: LayoutSchema) => void
  canvasRef?: RefObject<Canvas | null>
}) {
  const element = useRef<HTMLCanvasElement>(null)
  const instance = useRef<Canvas | null>(null)
  const schemaRef = useRef(schema)
  const onSelectRef = useRef(onSelect)
  const onChangeRef = useRef(onChange)
  const changing = useRef(false)
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
      backgroundColor: schema.background,
    })
    instance.current = canvas
    if (canvasRef) canvasRef.current = canvas

    const select = () => {
      const object = canvas.getActiveObject() as SakekeepObject | undefined
      onSelectRef.current(object?.sakekeepElementId ?? null)
    }
    const modified = (event: { target?: FabricObject; transform?: { action?: string } }) => {
      const object = event.target as SakekeepObject | undefined
      const elementId = object?.sakekeepElementId
      if (!object || !elementId) return
      if (object instanceof IText && !event.transform?.action) return
      const next: LayoutSchema = {
        ...schemaRef.current,
        elements: schemaRef.current.elements.map((candidate) =>
          candidate.id === elementId
            ? {
                ...candidate,
                geometry: geometryFromObject(object, width),
              }
            : candidate
        ),
      }
      schemaRef.current = next
      changing.current = true
      onChangeRef.current(next)
      requestAnimationFrame(() => {
        changing.current = false
      })
    }
    const textEdited = (event: { target: IText }) => {
      const object = event.target as IText & SakekeepObject
      if (!object.sakekeepElementId) return
      const next = applyInlineStaticTextEdit(
        schemaRef.current,
        object.sakekeepElementId,
        object.text
      )
      if (!next) return
      schemaRef.current = next
      changing.current = true
      onChangeRef.current(next)
      requestAnimationFrame(() => {
        changing.current = false
      })
    }
    canvas.on("selection:created", select)
    canvas.on("selection:updated", select)
    canvas.on("selection:cleared", select)
    canvas.on("object:modified", modified)
    canvas.on("mouse:dblclick", (event) => {
      const object = event.target as (IText & SakekeepObject) | undefined
      const element = schemaRef.current.elements.find(
        (candidate) => candidate.id === object?.sakekeepElementId
      )
      if (!object || element?.type !== "static-text" || object.isEditing) return
      canvas.setActiveObject(object)
      object.enterEditing(event.e)
      object.selectAll()
      canvas.requestRenderAll()
    })
    canvas.on("text:editing:exited", textEdited)

    return () => {
      if (canvasRef) canvasRef.current = null
      instance.current = null
      canvas.dispose()
    }
  }, [canvasRef, width])

  useEffect(() => {
    const canvas = instance.current
    if (!canvas || changing.current) return
    let cancelled = false
    const render = async () => {
      const objects = await Promise.all(
        schema.elements.map((item) => objectForElement(item, width))
      )
      if (cancelled) return
      canvas.clear()
      canvas.backgroundColor = schema.background
      canvas.add(...objects)
      if (selectedId) {
        const selected = objects.find((object) => object.sakekeepElementId === selectedId)
        if (selected) canvas.setActiveObject(selected)
      }
      canvas.requestRenderAll()
    }
    void render()
    return () => {
      cancelled = true
    }
  }, [schema, selectedId, width])

  return (
    <div
      className="relative overflow-hidden rounded-lg bg-background shadow-2xl ring-1 ring-foreground/15"
      style={{
        width,
        height: width * (PAGE_SPEC.mediaHeightMm / PAGE_SPEC.mediaWidthMm),
      }}
    >
      <canvas ref={element} aria-label="Visual DIN A5 landscape layout canvas" />
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
    </div>
  )
}
