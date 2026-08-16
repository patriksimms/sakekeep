// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type Project } from "#/domain/types.ts"
import { completeForm, cycleSettings, layoutFixture, submissionFixture } from "#/test/fixtures.ts"

const updateBook = vi.fn()

vi.mock("#/lib/api.ts", async () => {
  const actual = await vi.importActual<typeof import("#/lib/api.ts")>("#/lib/api.ts")
  return {
    ...actual,
    projectApi: {
      ...actual.projectApi,
      updateBook: (...args: unknown[]) => updateBook(...args),
    },
  }
})

const { BookReview } = await import("./book-review.tsx")

beforeEach(() => updateBook.mockReset())

afterEach(cleanup)

describe("book review problems", () => {
  it("selects the affected page and text bounding box", () => {
    const layout = layoutFixture()
    const textElement = layout.schema.elements.find((element) => element.type === "bound-text")!
    const submissions = [
      submissionFixture("10000000-0000-4000-8000-000000000001", 1),
      submissionFixture("10000000-0000-4000-8000-000000000002", 2),
    ]
    submissions[0]!.answers.memory = "First response memory"
    submissions[1]!.answers.memory = "Second response memory"
    const problem = {
      id: `submission:${submissions[1]!.id}:${textElement.id}:text-overflow:text-overflow`,
      code: "text-overflow" as const,
      pageId: `submission:${submissions[1]!.id}`,
      elementId: textElement.id,
      message: "A memory overflows on Response 2. It needs 3 lines, but only 1 line fits.",
      blocking: true,
    }
    const project = {
      id: layout.projectId,
      title: "Test book",
      occasion: null,
      state: "closed",
      formSchema: completeForm,
      layouts: [layout],
      submissions,
      bookStatus: "current",
      archivedAt: null,
      book: {
        projectId: layout.projectId,
        settings: cycleSettings,
        pages: submissions.map((submission, index) => ({
          id: `submission:${submission.id}`,
          kind: "submission" as const,
          submissionId: submission.id,
          layoutId: layout.id,
          problems: index === 1 ? [problem] : [],
        })),
        sourceFingerprint: "test",
        generatedAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      },
    } as Project

    render(<BookReview project={project} onProjectChange={() => undefined} />)
    fireEvent.click(screen.getByRole("button", { name: /A memory overflows on Response 2/ }))

    expect(screen.getByTestId("preview-layout-elements").textContent).toContain(
      "Second response memory"
    )
    expect(
      document.querySelector(`[data-layout-element-id="${textElement.id}"]`)?.getAttribute("style")
    ).toContain("outline: 2px solid var(--destructive)")
    expect(
      screen
        .getByRole("button", { name: /A memory overflows on Response 2/ })
        .getAttribute("aria-pressed")
    ).toBe("true")
  })

  it("clears the selected problem after a page layout override succeeds", async () => {
    const layout = layoutFixture()
    const replacement = layoutFixture("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", 1)
    const textElement = layout.schema.elements.find((element) => element.type === "bound-text")!
    const submission = submissionFixture("10000000-0000-4000-8000-000000000001", 1)
    const problem = {
      id: `submission:${submission.id}:${textElement.id}:text-overflow:text-overflow`,
      code: "text-overflow" as const,
      pageId: `submission:${submission.id}`,
      elementId: textElement.id,
      message: "A memory overflows on Response 1.",
      blocking: true,
    }
    const page = {
      id: `submission:${submission.id}`,
      kind: "submission" as const,
      submissionId: submission.id,
      layoutId: layout.id,
      problems: [problem],
    }
    const book = {
      projectId: layout.projectId,
      settings: cycleSettings,
      pages: [page],
      sourceFingerprint: "test",
      generatedAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }
    const project = {
      id: layout.projectId,
      title: "Test book",
      occasion: null,
      state: "closed",
      formSchema: completeForm,
      layouts: [layout, replacement],
      submissions: [submission],
      bookStatus: "current",
      archivedAt: null,
      book,
    } as Project
    updateBook.mockResolvedValue({
      ...book,
      pages: [{ ...page, layoutId: replacement.id }],
    })

    render(<BookReview project={project} onProjectChange={() => undefined} />)
    const problemButton = screen.getByRole("button", { name: /A memory overflows/ })
    fireEvent.click(problemButton)
    expect(problemButton.getAttribute("aria-pressed")).toBe("true")

    const layoutSelect = screen.getByRole("combobox", { name: "Page layout" })
    layoutSelect.focus()
    fireEvent.keyDown(layoutSelect, { key: "ArrowDown" })
    fireEvent.keyDown(screen.getByRole("option", { name: layout.name }), { key: "ArrowDown" })
    fireEvent.keyDown(screen.getByRole("option", { name: replacement.name }), { key: "Enter" })

    await waitFor(() => expect(updateBook).toHaveBeenCalledOnce())
    expect(problemButton.getAttribute("aria-pressed")).toBe("false")
    expect(
      document.querySelector(`[data-layout-element-id="${textElement.id}"]`)?.getAttribute("style")
    ).not.toContain("outline: 2px solid var(--destructive)")
  })
})
