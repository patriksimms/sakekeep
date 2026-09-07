// @vitest-environment jsdom

import { useState } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type BookPage, type Project } from "#/domain/types.ts"
import {
  completeForm,
  cycleSettings,
  layoutFixture,
  standaloneLayoutFixture,
  submissionFixture,
} from "#/test/fixtures.ts"

const updateBook = vi.fn()
const generate = vi.fn()

vi.mock("#/lib/api.ts", async () => {
  const actual = await vi.importActual<typeof import("#/lib/api.ts")>("#/lib/api.ts")
  return {
    ...actual,
    projectApi: {
      ...actual.projectApi,
      updateBook: (...args: unknown[]) => updateBook(...args),
      generate: (...args: unknown[]) => generate(...args),
    },
  }
})

const { BookReview } = await import("./book-review.tsx")

beforeEach(() => {
  updateBook.mockReset()
  generate.mockReset()
})

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

    render(<BookReview project={project} onProjectChange={() => undefined} view="detail" />)
    fireEvent.click(screen.getByRole("button", { name: /A memory overflows on Response 2/ }))

    const renderedLines = Array.from(
      screen.getByTestId("preview-layout-elements").querySelectorAll("span")
    )
      .map((line) => line.textContent)
      .join(" ")
    expect(renderedLines).toContain("Second response memory")
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

    render(<BookReview project={project} onProjectChange={() => undefined} view="detail" />)
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

describe("book review page grid", () => {
  function gridProject() {
    const layout = layoutFixture()
    const cover = standaloneLayoutFixture("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "front-cover", 1)
    const submission = submissionFixture("10000000-0000-4000-8000-000000000001", 1)
    const pages: BookPage[] = [
      {
        id: "standalone:cover",
        kind: "standalone",
        layoutId: cover.id,
        problems: [],
      },
      {
        id: `submission:${submission.id}`,
        kind: "submission",
        submissionId: submission.id,
        layoutId: layout.id,
        problems: [],
      },
    ]
    return {
      id: layout.projectId,
      title: "Test book",
      occasion: null,
      state: "closed",
      formSchema: completeForm,
      layouts: [layout, cover],
      submissions: [submission],
      bookStatus: "current",
      archivedAt: null,
      book: {
        projectId: layout.projectId,
        settings: cycleSettings,
        pages,
        sourceFingerprint: "test",
        generatedAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      },
    } as Project
  }

  it("shows every generated page in book order", () => {
    const project = gridProject()

    render(<BookReview project={project} onProjectChange={() => undefined} view="grid" />)

    const tiles = screen.getAllByTestId("book-page-tile")
    expect(tiles).toHaveLength(2)
    expect(tiles[0]!.getAttribute("aria-label")).toContain("Front cover: Front cover")
    expect(tiles[1]!.getAttribute("aria-label")).toContain("Person 1")
    expect(screen.queryByRole("combobox", { name: "Page layout" })).toBeNull()
  })

  it("opens the detail view on the page that was clicked", () => {
    const project = gridProject()
    const onViewChange = vi.fn()

    const { rerender } = render(
      <BookReview
        project={project}
        onProjectChange={() => undefined}
        view="grid"
        onViewChange={onViewChange}
      />
    )
    fireEvent.click(screen.getAllByTestId("book-page-tile")[1]!)

    expect(onViewChange).toHaveBeenCalledWith("detail")

    rerender(
      <BookReview
        project={project}
        onProjectChange={() => undefined}
        view="detail"
        onViewChange={onViewChange}
      />
    )
    expect(screen.getByText("2. Person 1")).toBeTruthy()
    const renderedLines = Array.from(
      screen.getByTestId("preview-layout-elements").querySelectorAll("span")
    )
      .map((line) => line.textContent)
      .join(" ")
    expect(renderedLines).toContain(project.submissions![0]!.answers.memory)
  })
})

it("records a resolution override and automatically replaces its blocking preview", async () => {
  const layout = layoutFixture()
  const submission = submissionFixture("10000000-0000-4000-8000-000000000001", 1)
  const pageId = `submission:${submission.id}`
  const assetId = "20000000-0000-4000-8000-000000000001"
  const initial = {
    id: layout.projectId,
    state: "closed",
    archivedAt: null,
    formSchema: completeForm,
    layouts: [layout],
    submissions: [submission],
    bookStatus: "current",
    book: {
      projectId: layout.projectId,
      settings: cycleSettings,
      pages: [
        {
          id: pageId,
          kind: "submission",
          submissionId: submission.id,
          layoutId: layout.id,
          problems: [
            {
              id: "resolution",
              code: "image-blocking-resolution",
              pageId,
              assetId,
              blocking: true,
              message: "Photo resolution is too low",
            },
          ],
        },
      ],
      sourceFingerprint: "old",
      generatedAt: "",
      updatedAt: "",
    },
  } as Project
  const settings = { ...cycleSettings, resolutionOverrides: [assetId] }
  updateBook.mockResolvedValue({ ...initial.book!, settings })
  generate.mockResolvedValue({
    ...initial.book!,
    settings,
    pages: initial.book!.pages.map((page) => ({ ...page, problems: [] })),
  })
  function Review() {
    const [project, setProject] = useState(initial)
    return <BookReview project={project} onProjectChange={setProject} view="detail" />
  }
  render(<Review />)
  fireEvent.click(screen.getByRole("button", { name: "Record resolution override" }))
  await waitFor(() => expect(screen.getByText("No page problems")).toBeTruthy())
  expect(updateBook).toHaveBeenCalledExactlyOnceWith(initial.id, { settings })
  expect(generate).toHaveBeenCalledExactlyOnceWith(initial.id, settings)
})

it("keeps the stored preview and retry available after the last layout is deleted", async () => {
  const project: Project = {
    id: "project",
    title: "Book",
    occasion: null,
    formRevision: 1,
    shareUrl: null,
    submissionCount: 0,
    pageFormat: "a5",
    pageOrientation: "landscape",
    createdAt: "",
    updatedAt: "",
    state: "closed",
    archivedAt: null,
    formSchema: completeForm,
    layouts: [],
    bookStatus: "stale",
    book: {
      projectId: "project",
      settings: cycleSettings,
      pages: [{ id: "standalone:old", kind: "standalone", layoutId: "deleted", problems: [] }],
      sourceFingerprint: "old",
      generatedAt: "",
      updatedAt: "",
    },
  }
  generate.mockRejectedValue(new Error("Create a layout before generating."))
  render(<BookReview project={project} onProjectChange={() => undefined} />)
  await screen.findByRole("button", { name: "Retry" })
  expect(screen.getByTestId("page-preview")).toBeTruthy()
  expect(screen.getByText("Create a layout before generating.")).toBeTruthy()
})
