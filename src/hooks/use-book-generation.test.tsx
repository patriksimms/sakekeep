// @vitest-environment jsdom

import { StrictMode, useState } from "react"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { GeneratedBook, Project } from "#/domain/types.ts"
import { completeForm, cycleSettings, layoutFixture } from "#/test/fixtures.ts"
import { useBookGeneration } from "./use-book-generation.ts"

const { generate, updateBook, capture } = vi.hoisted(() => ({
  generate: vi.fn(),
  updateBook: vi.fn(),
  capture: vi.fn(),
}))
vi.mock("#/lib/api.ts", () => ({ projectApi: { generate, updateBook } }))
vi.mock("#/lib/analytics.ts", () => ({ captureAnalyticsEvent: capture }))

function fixture(): Project {
  const layout = layoutFixture()
  return {
    id: layout.projectId,
    title: "Book",
    occasion: null,
    state: "closed",
    formSchema: completeForm,
    formRevision: 1,
    shareUrl: null,
    submissionCount: 0,
    bookStatus: "stale",
    pageFormat: "a5",
    pageOrientation: "landscape",
    layouts: [layout],
    submissions: [],
    archivedAt: null,
    createdAt: "",
    updatedAt: "",
    book: {
      projectId: layout.projectId,
      settings: cycleSettings,
      pages: [],
      sourceFingerprint: "old",
      generatedAt: "",
      updatedAt: "",
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function mount(initial = fixture(), beforeGenerate?: () => Promise<Project>, active = true) {
  return renderHook(
    ({ active }) => {
      const [project, setProject] = useState(initial)
      return {
        project,
        setProject,
        ...useBookGeneration({ project, active, onProjectChange: setProject, beforeGenerate }),
      }
    },
    { initialProps: { active }, wrapper: StrictMode }
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  generate.mockResolvedValue({ ...fixture().book!, sourceFingerprint: "new" })
})
afterEach(cleanup)

describe("automatic book generation", () => {
  it("waits for layout saves, uses their settings, and generates only once under StrictMode", async () => {
    const saved = fixture()
    saved.book!.settings = { ...cycleSettings, seed: "saved seed" }
    const flush = deferred<Project>()
    const { result } = mount({ ...saved, bookStatus: "current" }, () => flush.promise)
    expect(result.current.busy).toBe(true)
    expect(generate).not.toHaveBeenCalled()
    await act(async () => flush.resolve(saved))
    await waitFor(() => expect(result.current.project.bookStatus).toBe("current"))
    expect(generate).toHaveBeenCalledExactlyOnceWith(saved.id, saved.book!.settings)
    expect(capture).toHaveBeenCalledWith(
      "book_review:regeneration_success",
      expect.objectContaining({ trigger: "review_open", duration_ms: expect.any(Number) })
    )
  })

  it("keeps the stale book on failure, does not loop, and retries with measured recovery", async () => {
    generate.mockRejectedValueOnce(new Error("Unavailable"))
    const { result, rerender } = mount()
    await waitFor(() => expect(result.current.error).toBe("Unavailable"))
    expect(result.current.project.book!.sourceFingerprint).toBe("old")
    rerender({ active: true })
    expect(generate).toHaveBeenCalledTimes(1)
    await act(async () => result.current.retry())
    await waitFor(() => expect(result.current.project.book!.sourceFingerprint).toBe("new"))
    expect(result.current.error).toBeNull()
    expect(capture).toHaveBeenCalledWith(
      "book_review:regeneration_failure",
      expect.objectContaining({ duration_ms: expect.any(Number) })
    )
    expect(capture).toHaveBeenCalledWith("book_review:regeneration_retry", {
      stale_cause: "saved_inputs",
    })
    expect(capture).toHaveBeenCalledWith(
      "book_review:regeneration_success",
      expect.objectContaining({ trigger: "retry" })
    )
  })

  it("defers stale books until review becomes active and retains an in-flight job across tab changes", async () => {
    const request = deferred<GeneratedBook>()
    generate.mockReturnValue(request.promise)
    const { result, rerender } = mount(fixture(), undefined, false)
    expect(generate).not.toHaveBeenCalled()
    rerender({ active: true })
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1))
    rerender({ active: false })
    rerender({ active: true })
    await act(async () => request.resolve({ ...fixture().book!, sourceFingerprint: "new" }))
    expect(generate).toHaveBeenCalledTimes(1)
    expect(result.current.project.bookStatus).toBe("current")
  })

  it("saves settings before rebuilding and rejects overlapping edits", async () => {
    const cause = "random_seed"
    const initial = { ...fixture(), bookStatus: "current" as const }
    const save = deferred<GeneratedBook>()
    updateBook.mockReturnValue(save.promise)
    const { result } = mount(initial)
    const settings = { ...cycleSettings, seed: "next" }
    let saving!: Promise<void>
    act(() => {
      saving = result.current.updateBook({ settings }, cause)
    })
    expect(result.current.busy).toBe(true)
    await act(async () => {
      await expect(result.current.updateBook({ settings: cycleSettings }, cause)).rejects.toThrow(
        "Wait for the current book update to finish."
      )
    })
    expect(updateBook).toHaveBeenCalledTimes(1)
    expect(generate).not.toHaveBeenCalled()
    await act(async () => {
      save.resolve({ ...initial.book!, settings })
      await saving
    })
    await waitFor(() => expect(generate).toHaveBeenCalledExactlyOnceWith(initial.id, settings))
    expect(capture).toHaveBeenCalledWith("book_review:regeneration_attempt", {
      trigger: "book_change",
      stale_cause: cause,
    })
  })

  it("does not generate after a failed save, and accepts the next successful edit", async () => {
    const initial = { ...fixture(), bookStatus: "current" as const }
    updateBook.mockRejectedValueOnce(new Error("Save failed")).mockResolvedValue(initial.book)
    const { result } = mount(initial)
    await act(async () => {
      await expect(result.current.updateBook({}, "page_order")).rejects.toThrow("Save failed")
    })
    expect(result.current.busy).toBe(false)
    expect(generate).not.toHaveBeenCalled()
    await act(async () => result.current.updateBook({}, "page_order"))
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1))
  })

  it("does not generate if layout flushing fails", async () => {
    const { result } = mount(fixture(), async () => {
      throw new Error("Layout save failed")
    })
    await waitFor(() => expect(result.current.error).toBe("Layout save failed"))
    expect(generate).not.toHaveBeenCalled()
  })

  it("keeps first generation explicit and respects archived and collecting projects", async () => {
    const initial = { ...fixture(), book: null, bookStatus: "not-generated" as const }
    const { result } = mount(initial)
    expect(generate).not.toHaveBeenCalled()
    await act(async () => result.current.generateInitial(cycleSettings))
    expect(generate).toHaveBeenCalledExactlyOnceWith(initial.id, cycleSettings)
    cleanup()
    generate.mockClear()
    mount({ ...fixture(), archivedAt: "2026-09-05" })
    mount({ ...fixture(), state: "collecting" })
    expect(generate).not.toHaveBeenCalled()
  })
})
