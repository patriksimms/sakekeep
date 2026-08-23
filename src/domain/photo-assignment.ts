import { gallerySlots } from "./layout.ts"
import {
  type FormQuestion,
  type ImageAnswer,
  type LayoutElement,
  type SubmissionAnswer,
  type SubmissionAnswers,
} from "./types.ts"

export type PhotoFrameElement = Extract<LayoutElement, { type: "image-frame" | "gallery-frame" }>

export function isPhotoFrame(element: LayoutElement): element is PhotoFrameElement {
  return element.type === "image-frame" || element.type === "gallery-frame"
}

/** Photos a contributor uploaded for one question, ignoring malformed answer payloads. */
export function answerImages(answer: SubmissionAnswer | undefined): ImageAnswer[] {
  if (!Array.isArray(answer)) return []
  return answer.filter(
    (item): item is ImageAnswer =>
      typeof item === "object" && item !== null && "assetId" in item && "width" in item
  )
}

/** How many photos a frame shows. An image frame holds one, a gallery one per slot. */
export function frameSlotCount(element: PhotoFrameElement): number {
  if (element.type === "image-frame") return 1
  return gallerySlots(
    element.arrangement,
    element.geometry.width,
    element.geometry.height,
    element.gap
  ).length
}

/**
 * Visual reading order: top to bottom, then left to right. The element id breaks remaining
 * ties so duplicating or relayering an element never reshuffles the photos.
 */
function readingOrder(left: PhotoFrameElement, right: PhotoFrameElement): number {
  if (left.geometry.y !== right.geometry.y) return left.geometry.y - right.geometry.y
  if (left.geometry.x !== right.geometry.x) return left.geometry.x - right.geometry.x
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

export interface QuestionPhotoAssignment {
  questionId: string
  photoCount: number
  slotCount: number
  /** Photos with no slot left, which are therefore not printed. */
  unplacedPhotoCount: number
  /** Slots with no photo left, which therefore print empty. */
  emptySlotCount: number
}

export interface PhotoAssignment {
  /**
   * Photos per frame id, index-aligned with that frame's slots. `undefined` marks a slot that
   * stays empty because the contributor uploaded fewer photos than the layout can show.
   */
  byElement: Map<string, Array<ImageAnswer | undefined>>
  questions: QuestionPhotoAssignment[]
}

/**
 * Spreads a response's photos across the frames bound to each question, so a layout with
 * several frames on one question shows several different photos. Distribution is scoped per
 * question and deterministic: photo N always lands in the Nth slot of the reading order, which
 * keeps per-element focal points meaningful across regenerations.
 *
 * Preview, PDF export, and preflight all read from this so a reported problem always describes
 * the photo that actually prints.
 */
export function assignPhotosToFrames(
  elements: LayoutElement[],
  answers: SubmissionAnswers
): PhotoAssignment {
  const framesByQuestion = new Map<string, PhotoFrameElement[]>()
  for (const element of elements) {
    if (!isPhotoFrame(element)) continue
    const frames = framesByQuestion.get(element.questionId)
    if (frames) frames.push(element)
    else framesByQuestion.set(element.questionId, [element])
  }

  const byElement = new Map<string, Array<ImageAnswer | undefined>>()
  const questions: QuestionPhotoAssignment[] = []
  for (const [questionId, frames] of framesByQuestion) {
    const photos = answerImages(answers[questionId])
    let taken = 0
    for (const frame of [...frames].sort(readingOrder)) {
      const slotCount = frameSlotCount(frame)
      byElement.set(
        frame.id,
        Array.from({ length: slotCount }, (_, index) => photos[taken + index])
      )
      taken += slotCount
    }
    questions.push({
      questionId,
      photoCount: photos.length,
      slotCount: taken,
      unplacedPhotoCount: Math.max(0, photos.length - taken),
      emptySlotCount: Math.max(0, taken - photos.length),
    })
  }
  return { byElement, questions }
}

/** Photos assigned to one frame, index-aligned with its slots. */
export function framePhotos(
  assignment: PhotoAssignment,
  elementId: string
): Array<ImageAnswer | undefined> {
  return assignment.byElement.get(elementId) ?? []
}

export interface PhotoSlotMismatch {
  questionId: string
  slotCount: number
  maxImages: number
}

/**
 * Design-time check: the frames a layout binds to a question hold a different number of photos
 * than a contributor is allowed to upload. Questions the layout does not use are not reported.
 */
export function photoSlotMismatches(
  elements: LayoutElement[],
  questions: FormQuestion[]
): PhotoSlotMismatch[] {
  const slotCounts = new Map<string, number>()
  for (const element of elements) {
    if (!isPhotoFrame(element)) continue
    slotCounts.set(
      element.questionId,
      (slotCounts.get(element.questionId) ?? 0) + frameSlotCount(element)
    )
  }
  return questions.flatMap((question) => {
    if (question.type !== "images") return []
    const slotCount = slotCounts.get(question.id)
    if (slotCount === undefined || slotCount === question.maxImages) return []
    return [{ questionId: question.id, slotCount, maxImages: question.maxImages }]
  })
}
