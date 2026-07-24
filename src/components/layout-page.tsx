import { gallerySlots } from "#/domain/layout.ts"
import { boundQuestionPlaceholder } from "#/domain/layout-question-palette.ts"
import {
  canonicalToPercentageGeometry,
  millimetresToContainerWidth,
  pointsToContainerWidth,
} from "#/domain/layout-rendering.ts"
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
}

function answerImages(answer: SubmissionAnswer | undefined): ImageAnswer[] {
  if (!Array.isArray(answer)) return []
  return answer.filter(
    (item): item is ImageAnswer => typeof item === "object" && item !== null && "assetId" in item
  )
}

function answerText(
  answer: SubmissionAnswer | undefined,
  question: FormQuestion | undefined
): string {
  if (typeof answer === "string") return answer
  if (!Array.isArray(answer) || answer.length === 0 || typeof answer[0] !== "string") return ""
  if (question?.type === "radio" || question?.type === "checkboxes") {
    const labels = new Map(question.choices.map((choice) => [choice.id, choice.label]))
    return answer
      .filter((value): value is string => typeof value === "string")
      .map((value) => labels.get(value) ?? value)
      .join(", ")
  }
  return answer.filter((value): value is string => typeof value === "string").join(", ")
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
}: {
  element: LayoutElement
  content: LayoutPageContent
}) {
  const style = elementStyle(element)
  const question =
    "questionId" in element
      ? content.questions?.find((candidate) => candidate.id === element.questionId)
      : undefined

  if (element.type === "static-text" || element.type === "bound-text") {
    const value =
      element.type === "static-text"
        ? element.content
        : content.submission
          ? answerText(content.submission.answers[element.questionId], question)
          : boundQuestionPlaceholder(content.questions ?? [], element.questionId)
    return (
      <div
        data-layout-element-id={element.id}
        data-layout-element-type={element.type}
        style={{
          ...style,
          color: element.text.color,
          fontFamily:
            element.text.fontFamily === "Inter" ? "Inter Variable" : "Source Serif 4 Variable",
          fontSize: pointsToContainerWidth(element.text.fontSize),
          fontStyle: element.text.fontStyle,
          fontWeight: element.text.fontWeight,
          lineHeight: element.text.lineHeight,
          overflow: "hidden",
          textAlign: element.text.alignment,
          whiteSpace: "pre-wrap",
        }}
      >
        {element.type === "bound-text" && element.showLabel && (
          <strong className="block">{element.label || question?.prompt || "Question"}</strong>
        )}
        {value}
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
    return (
      <div
        data-layout-element-id={element.id}
        data-layout-element-type={element.type}
        style={{ ...style, overflow: "hidden" }}
      >
        {element.assetId && (
          <img
            src={
              content.decorativeAssetUrl?.(element.assetId) ??
              `/api/assets/${element.assetId}?variant=preview`
            }
            alt=""
            aria-hidden="true"
            className="size-full object-cover"
            style={{
              objectPosition: `${element.focalPoint.x * 100}% ${element.focalPoint.y * 100}%`,
            }}
          />
        )}
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
}: {
  schema: LayoutSchema
  content?: LayoutPageContent
  testId?: string
  ariaHidden?: boolean
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      data-testid={testId}
      aria-hidden={ariaHidden || undefined}
    >
      {schema.elements.map((element) => (
        <ElementContent key={element.id} element={element} content={content} />
      ))}
    </div>
  )
}
