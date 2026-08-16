import { gallerySlots } from "#/domain/layout.ts"
import { boundQuestionPlaceholder } from "#/domain/layout-question-palette.ts"
import {
  canonicalToPercentageGeometry,
  millimetresToContainerWidth,
  pointsToContainerWidth,
} from "#/domain/layout-rendering.ts"
import { layoutText, textRunsForElement } from "#/domain/text-layout.ts"
import {
  type FormQuestion,
  type ImageAnswer,
  type LayoutElement,
  type LayoutSchema,
  type SubmissionAnswer,
  type SubmissionSummary,
} from "#/domain/types.ts"

export interface LayoutPageContent {
  questions?: FormQuestion[]
  submission?: SubmissionSummary
  decorativeAssetUrl?: (assetId: string) => string
  decorativePlaceholderUrl?: string
}

function answerImages(answer: SubmissionAnswer | undefined): ImageAnswer[] {
  if (!Array.isArray(answer)) return []
  return answer.filter(
    (item): item is ImageAnswer => typeof item === "object" && item !== null && "assetId" in item
  )
}

function elementStyle(element: LayoutElement): React.CSSProperties {
  const geometry = canonicalToPercentageGeometry(element.geometry)
  return {
    position: "absolute",
    boxSizing: "border-box",
    left: `${geometry.left}%`,
    top: `${geometry.top}%`,
    width: `${geometry.width}%`,
    height: `${geometry.height}%`,
    transform: `rotate(${geometry.rotation}deg)`,
    transformOrigin: "top left",
    opacity: element.opacity,
  }
}

export function textElementStyle(
  element: Extract<LayoutElement, { type: "static-text" | "bound-text" }>,
  effectiveFontSize = element.text.fontSize
): React.CSSProperties {
  return {
    ...elementStyle(element),
    color: element.text.color,
    fontFamily: element.text.fontFamily === "Inter" ? "Inter Variable" : "Source Serif 4 Variable",
    fontSize: pointsToContainerWidth(effectiveFontSize),
    fontStyle: element.text.fontStyle,
    fontWeight: element.text.fontWeight,
    lineHeight: element.text.lineHeight,
    overflow: "visible",
    textAlign: element.text.alignment,
    whiteSpace: "pre-wrap",
  }
}

function imagePosition(
  element: Extract<LayoutElement, { type: "image-frame" | "gallery-frame" }>,
  image: ImageAnswer
): string {
  const focalPoint = element.focalPoint ?? image.focalPoint ?? { x: 0.5, y: 0.5 }
  return `${focalPoint.x * 100}% ${focalPoint.y * 100}%`
}

function ElementContent({
  element,
  content,
  showEditorPlaceholders,
  editingElementId,
}: {
  element: LayoutElement
  content: LayoutPageContent
  showEditorPlaceholders: boolean
  editingElementId?: string
}) {
  const style = elementStyle(element)
  const question =
    "questionId" in element
      ? content.questions?.find((candidate) => candidate.id === element.questionId)
      : undefined

  if (element.type === "static-text" || element.type === "bound-text") {
    const answer =
      element.type === "bound-text" && content.submission
        ? (content.submission.answers[element.questionId] ?? "")
        : undefined
    const placeholder =
      element.type === "bound-text" && !content.submission
        ? boundQuestionPlaceholder(content.questions ?? [], element.questionId)
        : ""
    const runs = textRunsForElement(element, question, answer, placeholder)
    const layout = layoutText(runs, element.geometry.width, element.geometry.height, element.text)
    const hasLabel = element.type === "bound-text" && element.showLabel
    return (
      <div
        data-layout-element-id={element.id}
        data-layout-element-type={element.type}
        data-text-overflow={!layout.fits || undefined}
        style={{
          ...textElementStyle(element, layout.effectiveFontSize),
          outline: !layout.fits ? "1px solid var(--destructive)" : undefined,
          background: !layout.fits
            ? "color-mix(in srgb, var(--destructive) 8%, transparent)"
            : undefined,
        }}
      >
        {element.type === "bound-text" &&
          !hasLabel &&
          showEditorPlaceholders &&
          editingElementId !== element.id && (
            <strong
              data-editor-empty-label
              className="absolute top-0 left-0 z-10 bg-background/90 px-1 py-0.5 font-sans text-[10px] leading-none font-normal text-muted-foreground italic"
            >
              Add label…
            </strong>
          )}
        {layout.renderedLines.map((line, index) => (
          <span key={index} className="block" style={{ fontWeight: line.fontWeight }}>
            {line.text || "\u00a0"}
          </span>
        ))}
      </div>
    )
  }

  if (element.type === "rectangle" || element.type === "circle") {
    return (
      <div
        data-layout-element-id={element.id}
        data-layout-element-type={element.type}
        style={{
          ...style,
          background: element.fill,
          borderColor: element.stroke,
          borderRadius: element.type === "circle" ? "50%" : undefined,
          borderStyle: element.strokeWidth > 0 ? "solid" : "none",
          borderWidth:
            element.strokeWidth > 0 ? millimetresToContainerWidth(element.strokeWidth) : undefined,
        }}
      />
    )
  }

  if (element.type === "line") {
    return (
      <div
        data-layout-element-id={element.id}
        data-layout-element-type={element.type}
        style={style}
      >
        <svg
          aria-hidden="true"
          width="100%"
          height="100%"
          viewBox={`0 0 ${element.geometry.width} ${element.geometry.height}`}
          preserveAspectRatio="none"
          className="block overflow-visible"
        >
          <line
            x1="0"
            y1="0"
            x2={element.geometry.width}
            y2={element.geometry.height}
            stroke={element.stroke}
            strokeWidth={element.strokeWidth}
          />
        </svg>
      </div>
    )
  }

  if (element.type === "decorative-image") {
    const source = element.assetId
      ? (content.decorativeAssetUrl?.(element.assetId) ??
        `/api/assets/${element.assetId}?variant=preview`)
      : content.decorativePlaceholderUrl
    if (!source) return null
    return (
      <div
        data-layout-element-id={element.id}
        data-layout-element-type={element.type}
        style={{ ...style, overflow: "hidden" }}
      >
        <img
          src={source}
          alt=""
          aria-hidden="true"
          className="size-full object-cover"
          style={{
            objectPosition: `${element.focalPoint.x * 100}% ${element.focalPoint.y * 100}%`,
          }}
        />
      </div>
    )
  }

  if (element.type !== "image-frame" && element.type !== "gallery-frame") return null
  const images = answerImages(content.submission?.answers[element.questionId])
  if (element.type === "image-frame") {
    const image = images[0]
    return (
      <div
        data-layout-element-id={element.id}
        data-layout-element-type={element.type}
        style={{
          ...style,
          borderRadius: millimetresToContainerWidth(element.cornerRadius),
          overflow: "hidden",
        }}
      >
        {image?.previewUrl ? (
          <img
            src={image.previewUrl}
            alt=""
            aria-hidden="true"
            className="size-full object-cover"
            style={{ objectPosition: imagePosition(element, image) }}
          />
        ) : (
          <div className="size-full border border-dashed border-foreground/25 bg-muted/20" />
        )}
      </div>
    )
  }

  const slots = gallerySlots(
    element.arrangement,
    element.geometry.width,
    element.geometry.height,
    element.gap
  )
  return (
    <div
      data-layout-element-id={element.id}
      data-layout-element-type={element.type}
      style={{ ...style, overflow: "hidden" }}
    >
      {slots.map((slot, index) => {
        const image = images[index]
        const slotStyle: React.CSSProperties = {
          position: "absolute",
          left: `${(slot.x / element.geometry.width) * 100}%`,
          top: `${(slot.y / element.geometry.height) * 100}%`,
          width: `${(slot.width / element.geometry.width) * 100}%`,
          height: `${(slot.height / element.geometry.height) * 100}%`,
          overflow: "hidden",
        }
        return image?.previewUrl ? (
          <div key={`${image.assetId}-${index}`} style={slotStyle}>
            <img
              src={image.previewUrl}
              alt=""
              aria-hidden="true"
              className="size-full object-cover"
              style={{ objectPosition: imagePosition(element, image) }}
            />
          </div>
        ) : (
          <span
            key={index}
            className="border border-dashed border-foreground/25 bg-muted/20"
            style={slotStyle}
          />
        )
      })}
    </div>
  )
}

export function LayoutPageElements({
  schema,
  content = {},
  testId,
  ariaHidden = false,
  showEditorPlaceholders = false,
  editingElementId,
}: {
  schema: LayoutSchema
  content?: LayoutPageContent
  testId?: string
  ariaHidden?: boolean
  showEditorPlaceholders?: boolean
  editingElementId?: string
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      data-testid={testId}
      aria-hidden={ariaHidden || undefined}
    >
      {schema.elements.map((element) => (
        <ElementContent
          key={element.id}
          element={element}
          content={content}
          showEditorPlaceholders={showEditorPlaceholders}
          editingElementId={editingElementId}
        />
      ))}
    </div>
  )
}
