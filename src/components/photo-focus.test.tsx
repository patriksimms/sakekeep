// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { photoFocalPoint } from "#/domain/photo-focus.ts"
import { type ImageAnswer, type Project } from "#/domain/types.ts"
import { completeForm, cycleSettings, layoutFixture, submissionFixture } from "#/test/fixtures.ts"

const setPhotoFocalPoint = vi.fn()

vi.mock("#/lib/api.ts", async () => {
  const actual = await vi.importActual<typeof import("#/lib/api.ts")>("#/lib/api.ts")
  return {
    ...actual,
    projectApi: {
      ...actual.projectApi,
      setPhotoFocalPoint: (...args: unknown[]) => setPhotoFocalPoint(...args),
    },
  }
})

const { BookReview } = await import("./book-review.tsx")

const FRAME = 200

// jsdom lays nothing out and knows no pointer capture, so the frame the crop maths needs has to be
// stated here. A tall photo in a square frame is the case this feature exists for.
beforeEach(() => {
  setPhotoFocalPoint.mockReset()
  setPhotoFocalPoint.mockResolvedValue(undefined)
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => FRAME,
  })
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => FRAME,
  })
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: FRAME, height: FRAME, right: FRAME, bottom: FRAME }) as DOMRect
  HTMLElement.prototype.setPointerCapture = () => undefined
  HTMLElement.prototype.releasePointerCapture = () => undefined
})

afterEach(cleanup)

function photo(focalPoint?: { x: number; y: number }): ImageAnswer {
  return {
    assetId: "asset-portrait",
    name: "portrait.jpg",
    mimeType: "image/jpeg",
    width: 200,
    height: 800,
    sizeBytes: 2_048,
    previewUrl: "/preview/portrait.jpg",
    focalPoint,
  }
}

function reviewProject(focalPoint?: { x: number; y: number }): Project {
  const layout = layoutFixture()
  const submission = submissionFixture("10000000-0000-4000-8000-000000000001", 1)
  submission.answers.photos = [photo(focalPoint)]
  return {
    id: layout.projectId,
    title: "Test book",
    occasion: null,
    state: "closed",
    formSchema: completeForm,
    formRevision: 1,
    shareUrl: null,
    submissionCount: 1,
    layouts: [layout],
    submissions: [submission],
    bookStatus: "current",
    pageFormat: "a5",
    pageOrientation: "landscape",
    archivedAt: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    book: {
      projectId: layout.projectId,
      settings: cycleSettings,
      pages: [
        {
          id: `submission:${submission.id}`,
          kind: "submission" as const,
          submissionId: submission.id,
          layoutId: layout.id,
          problems: [],
        },
      ],
      sourceFingerprint: "test",
      generatedAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
  }
}

function handle() {
  return screen.getByRole("button", { name: "Move the crop of portrait.jpg" })
}

function croppedImage() {
  return document.querySelector<HTMLImageElement>('img[src="/preview/portrait.jpg"]')!
}

describe("adjusting where a photo is cropped", () => {
  it("reveals the top of a photo when it is dragged down, and saves on release", async () => {
    const onProjectChange = vi.fn()
    render(<BookReview project={reviewProject()} onProjectChange={onProjectChange} view="detail" />)

    fireEvent.pointerDown(handle(), { button: 0, clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(handle(), { clientX: 100, clientY: 250, pointerId: 1 })

    // The photo covers the frame with 600px hidden vertically, so a 150px drag is a quarter of it.
    expect(croppedImage().style.objectPosition).toBe("50% 25%")
    expect(setPhotoFocalPoint).not.toHaveBeenCalled()

    fireEvent.pointerUp(handle(), { pointerId: 1 })

    await waitFor(() => expect(setPhotoFocalPoint).toHaveBeenCalledTimes(1))
    expect(setPhotoFocalPoint).toHaveBeenCalledWith(expect.any(String), "asset-portrait", {
      x: 0.5,
      y: 0.25,
    })
  })

  it("keeps the book current, because a crop invalidates no generated page", async () => {
    const onProjectChange = vi.fn()
    render(<BookReview project={reviewProject()} onProjectChange={onProjectChange} view="detail" />)

    fireEvent.pointerDown(handle(), { button: 0, clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(handle(), { clientX: 100, clientY: 160, pointerId: 1 })
    fireEvent.pointerUp(handle(), { pointerId: 1 })

    await waitFor(() => expect(onProjectChange).toHaveBeenCalled())
    const updated = onProjectChange.mock.calls[0]![0] as Project
    expect(updated.bookStatus).toBe("current")
    expect(photoFocalPoint(updated.submissions!, "asset-portrait")).toEqual({ x: 0.5, y: 0.4 })
  })

  it("nudges with the arrow keys for anyone not using a pointer", async () => {
    render(<BookReview project={reviewProject()} onProjectChange={vi.fn()} view="detail" />)

    fireEvent.keyDown(handle(), { key: "ArrowUp", shiftKey: true })

    // Shift moves 16px of the 600px hidden below the frame, downwards through the photo.
    await waitFor(() => expect(setPhotoFocalPoint).toHaveBeenCalledTimes(1))
    const [, , focalPoint] = setPhotoFocalPoint.mock.calls[0]!
    expect((focalPoint as { y: number }).y).toBeCloseTo(0.5 + 16 / 600)
  })

  it("resets an adjusted photo back to the layout's own focus", async () => {
    render(
      <BookReview
        project={reviewProject({ x: 0.5, y: 0.1 })}
        onProjectChange={vi.fn()}
        view="detail"
      />
    )
    expect(croppedImage().style.objectPosition).toBe("50% 10%")

    fireEvent.focus(handle())
    fireEvent.click(screen.getByRole("button", { name: "Reset" }))

    await waitFor(() => expect(setPhotoFocalPoint).toHaveBeenCalledTimes(1))
    expect(setPhotoFocalPoint).toHaveBeenCalledWith(expect.any(String), "asset-portrait", null)
  })

  it("puts the old crop back when saving fails", async () => {
    setPhotoFocalPoint.mockRejectedValue(new Error("Network down"))
    const onProjectChange = vi.fn()
    render(
      <BookReview
        project={reviewProject({ x: 0.5, y: 0.8 })}
        onProjectChange={onProjectChange}
        view="detail"
      />
    )

    fireEvent.pointerDown(handle(), { button: 0, clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(handle(), { clientX: 100, clientY: 220, pointerId: 1 })
    fireEvent.pointerUp(handle(), { pointerId: 1 })

    await waitFor(() => expect(onProjectChange).toHaveBeenCalledTimes(2))
    const reverted = onProjectChange.mock.calls[1]![0] as Project
    expect(photoFocalPoint(reverted.submissions!, "asset-portrait")).toEqual({ x: 0.5, y: 0.8 })
  })
})
