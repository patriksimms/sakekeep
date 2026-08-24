import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"

import {
  FOCUS_NUDGE_PX,
  FOCUS_NUDGE_SHIFT_PX,
  coverRect,
  panFocalPoint,
  unrotateDelta,
  type FocalPoint,
  type Size,
} from "#/domain/photo-focus.ts"
import { type ImageAnswer } from "#/domain/types.ts"

export interface PhotoFocusControls {
  /** Crop centres being dragged right now, so the page follows the pointer before anything saves. */
  draft: Record<string, FocalPoint>
  onChange: (assetId: string, focalPoint: FocalPoint) => void
  onCommit: (assetId: string, focalPoint: FocalPoint) => void
  onSelect: (assetId: string) => void
  selectedAssetId?: string
}

interface FrameGeometry {
  centreX: number
  centreY: number
  size: Size
}

function frameGeometry(node: HTMLElement): FrameGeometry {
  const rect = node.getBoundingClientRect()
  return {
    centreX: rect.left + rect.width / 2,
    centreY: rect.top + rect.height / 2,
    // Layout size rather than the bounding box, which grows once a frame is rotated.
    size: { width: node.offsetWidth, height: node.offsetHeight },
  }
}

/**
 * The photo being dragged, drawn over the whole app: the crop as it will print, plus a faded
 * ghost of everything the frame cuts away. Seeing the discarded part is the point — a portrait
 * whose subject sits high looks correctly framed until you can see how much head is above it.
 */
function DragGhost({
  source,
  geometry,
  rotation,
  borderRadius,
  focalPoint,
  image,
}: {
  source: string
  geometry: FrameGeometry
  rotation: number
  borderRadius: string | number | undefined
  focalPoint: FocalPoint
  image: Size
}) {
  const drawn = coverRect(geometry.size, image, focalPoint)
  const drawnStyle: CSSProperties = {
    position: "absolute",
    left: drawn.x,
    top: drawn.y,
    width: drawn.width,
    height: drawn.height,
    maxWidth: "none",
  }
  return createPortal(
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-50"
      style={{
        left: geometry.centreX - geometry.size.width / 2,
        top: geometry.centreY - geometry.size.height / 2,
        width: geometry.size.width,
        height: geometry.size.height,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
      }}
    >
      <img src={source} alt="" style={{ ...drawnStyle, opacity: 0.35 }} />
      <div className="absolute inset-0 overflow-hidden" style={{ borderRadius }}>
        <img src={source} alt="" style={drawnStyle} />
      </div>
      <div className="absolute inset-0 ring-2 ring-primary" style={{ borderRadius }} />
    </div>,
    document.body
  )
}

/**
 * Wraps one printed photo with a grab handle. Dragging pans the crop; arrow keys nudge it for
 * anyone not using a pointer, and for the last few pixels a drag cannot land.
 */
export function PhotoFocusSlot({
  image,
  focalPoint,
  controls,
  rotation,
  borderRadius,
  label,
  children,
}: {
  image: ImageAnswer
  focalPoint: FocalPoint
  controls: PhotoFocusControls
  rotation: number
  borderRadius: string | number | undefined
  label: string
  children: ReactNode
}) {
  const frameRef = useRef<HTMLButtonElement>(null)
  const dragRef = useRef<{
    pointerX: number
    pointerY: number
    focalPoint: FocalPoint
  } | null>(null)
  const nudgingRef = useRef(false)
  const [geometry, setGeometry] = useState<FrameGeometry | null>(null)

  const source = image.previewUrl
  const imageSize = { width: image.width, height: image.height }

  // Held arrow keys repeat, so a nudge only moves the crop and the whole run is saved on release.
  const nudge = (deltaX: number, deltaY: number) => {
    const node = frameRef.current
    if (!node) return
    nudgingRef.current = true
    controls.onChange(
      image.assetId,
      panFocalPoint(focalPoint, frameGeometry(node).size, imageSize, deltaX, deltaY)
    )
  }

  const commitNudge = () => {
    if (!nudgingRef.current) return
    nudgingRef.current = false
    controls.onCommit(image.assetId, focalPoint)
  }

  const pointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    const node = frameRef.current
    if (!node) return
    event.preventDefault()
    node.setPointerCapture(event.pointerId)
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, focalPoint }
    setGeometry(frameGeometry(node))
    controls.onSelect(image.assetId)
  }

  const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    const node = frameRef.current
    if (!drag || !node) return
    const current = frameGeometry(node)
    setGeometry(current)
    const delta = unrotateDelta(
      event.clientX - drag.pointerX,
      event.clientY - drag.pointerY,
      rotation
    )
    controls.onChange(
      image.assetId,
      panFocalPoint(drag.focalPoint, current.size, imageSize, delta.width, delta.height)
    )
  }

  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    setGeometry(null)
    frameRef.current?.releasePointerCapture(event.pointerId)
    controls.onCommit(image.assetId, focalPoint)
  }

  return (
    <>
      {children}
      <button
        ref={frameRef}
        type="button"
        data-photo-focus-handle={image.assetId}
        aria-label={label}
        className="pointer-events-auto absolute inset-0 cursor-grab touch-none rounded-[inherit] focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none aria-pressed:ring-2 aria-pressed:ring-primary/60"
        aria-pressed={controls.selectedAssetId === image.assetId}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onFocus={() => controls.onSelect(image.assetId)}
        onBlur={commitNudge}
        onKeyUp={(event) => {
          // Only an arrow release ends a run. Letting go of Shift mid-nudge must not save.
          if (event.key.startsWith("Arrow")) commitNudge()
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? FOCUS_NUDGE_SHIFT_PX : FOCUS_NUDGE_PX
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          }
          const move = moves[event.key]
          if (!move) return
          event.preventDefault()
          nudge(move[0], move[1])
        }}
      />
      {geometry && source && dragRef.current && (
        <DragGhost
          source={source}
          geometry={geometry}
          rotation={rotation}
          borderRadius={borderRadius}
          focalPoint={focalPoint}
          image={imageSize}
        />
      )}
    </>
  )
}
