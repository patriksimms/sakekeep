import { answerImages } from "./photo-assignment.ts"
import {
  type ImageAnswer,
  type LayoutElement,
  type SubmissionAnswers,
  type SubmissionSummary,
} from "./types.ts"

export interface FocalPoint {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Rect extends Size {
  x: number
  y: number
}

export const CENTRE_FOCAL_POINT: FocalPoint = { x: 0.5, y: 0.5 }

/**
 * Which crop centre a photo actually prints with.
 *
 * A centre the organizer set on this specific photo wins over the layout's own focal point, which
 * stays the default for every photo nobody has adjusted. Preview and PDF export both resolve the
 * order here, so a crop chosen in the review is the crop that prints.
 */
export function effectiveFocalPoint(
  element: Extract<LayoutElement, { type: "image-frame" | "gallery-frame" }>,
  image: Pick<ImageAnswer, "focalPoint"> | undefined
): FocalPoint {
  return image?.focalPoint ?? element.focalPoint ?? CENTRE_FOCAL_POINT
}

/** Pixels one arrow-key press moves a photo inside its frame, and with Shift held. */
export const FOCUS_NUDGE_PX = 4
export const FOCUS_NUDGE_SHIFT_PX = 16

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * Where a photo is drawn inside its frame, relative to the frame's top-left corner.
 *
 * This reproduces `object-fit: cover` with `object-position`: the photo is scaled until it covers
 * the frame, and the focal point decides which fraction of the overflow is cut from each side.
 * `drawCroppedImage` in the PDF renderer does the same arithmetic, so a crop previewed here is the
 * crop that prints.
 */
export function coverRect(frame: Size, image: Size, focalPoint: FocalPoint): Rect {
  if (image.width <= 0 || image.height <= 0) {
    return { x: 0, y: 0, width: frame.width, height: frame.height }
  }
  const scale = Math.max(frame.width / image.width, frame.height / image.height)
  const width = image.width * scale
  const height = image.height * scale
  return {
    // The `+ 0` keeps a frame the photo exactly fills from reporting -0.
    x: -(width - frame.width) * focalPoint.x + 0,
    y: -(height - frame.height) * focalPoint.y + 0,
    width,
    height,
  }
}

/** How much of the photo falls outside the frame on each axis, in frame pixels. */
export function hiddenExtent(frame: Size, image: Size): Size {
  const drawn = coverRect(frame, image, CENTRE_FOCAL_POINT)
  return {
    width: Math.max(0, drawn.width - frame.width),
    height: Math.max(0, drawn.height - frame.height),
  }
}

/**
 * Moves the crop by a pixel delta measured in the frame's own orientation. Dragging the photo down
 * reveals more of its top, so a positive `deltaY` lowers the focal point's `y`.
 *
 * An axis with nothing hidden cannot pan, and stays exactly where it is rather than snapping.
 */
export function panFocalPoint(
  focalPoint: FocalPoint,
  frame: Size,
  image: Size,
  deltaX: number,
  deltaY: number
): FocalPoint {
  const hidden = hiddenExtent(frame, image)
  return {
    x: hidden.width === 0 ? focalPoint.x : clampUnit(focalPoint.x - deltaX / hidden.width),
    y: hidden.height === 0 ? focalPoint.y : clampUnit(focalPoint.y - deltaY / hidden.height),
  }
}

/**
 * Turns a screen-space drag into the frame's own coordinates. A rotated frame moves with its own
 * axes, so a horizontal drag on a frame tilted by 90° pans the photo vertically.
 */
export function unrotateDelta(deltaX: number, deltaY: number, rotationDegrees: number): Size {
  if (rotationDegrees === 0) return { width: deltaX, height: deltaY }
  const radians = (-rotationDegrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return {
    width: deltaX * cos - deltaY * sin,
    height: deltaX * sin + deltaY * cos,
  }
}

/** Whether two crop centres are close enough that persisting the difference is pointless. */
export function sameFocalPoint(left: FocalPoint | undefined, right: FocalPoint | undefined) {
  if (!left || !right) return left === right
  return Math.abs(left.x - right.x) < 0.0005 && Math.abs(left.y - right.y) < 0.0005
}

/** The crop centre currently stored for one photo, or undefined while it follows its layout. */
export function photoFocalPoint(
  submissions: SubmissionSummary[],
  assetId: string
): FocalPoint | undefined {
  for (const submission of submissions) {
    for (const answer of Object.values(submission.answers)) {
      for (const image of answerImages(answer)) {
        if (image.assetId === assetId) return image.focalPoint
      }
    }
  }
  return undefined
}

/** The photo itself, so the review can name what it is about to adjust. */
export function findPhoto(
  submissions: SubmissionSummary[],
  assetId: string
): ImageAnswer | undefined {
  for (const submission of submissions) {
    for (const answer of Object.values(submission.answers)) {
      for (const image of answerImages(answer)) {
        if (image.assetId === assetId) return image
      }
    }
  }
  return undefined
}

/**
 * Applies a crop centre to every copy of one photo, mirroring what the server stores so the review
 * can show the new crop without refetching. Passing `undefined` clears it back to the layout's own
 * focal point.
 */
export function withPhotoFocalPoint(
  submissions: SubmissionSummary[],
  assetId: string,
  focalPoint: FocalPoint | undefined
): SubmissionSummary[] {
  return submissions.map((submission) => {
    let changed = false
    const answers: SubmissionAnswers = {}
    for (const [questionId, answer] of Object.entries(submission.answers)) {
      if (!answerImages(answer).some((image) => image.assetId === assetId)) {
        answers[questionId] = answer
        continue
      }
      changed = true
      answers[questionId] = (answer as ImageAnswer[]).map((image) =>
        image.assetId === assetId ? { ...image, focalPoint } : image
      )
    }
    return changed ? { ...submission, answers } : submission
  })
}
