// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type Project } from "#/domain/types.ts"
import { completeForm, cycleSettings, layoutFixture, submissionFixture } from "#/test/fixtures.ts"

const exportProject = vi.fn()

vi.mock("#/lib/api.ts", async () => {
  const actual = await vi.importActual<typeof import("#/lib/api.ts")>("#/lib/api.ts")
  return {
    ...actual,
    projectApi: {
      ...actual.projectApi,
      export: (...args: unknown[]) => exportProject(...args),
    },
  }
})

const { ExportPanel } = await import("./export-panel.tsx")

beforeEach(() => {
  exportProject.mockReset()
  exportProject.mockRejectedValue(new Error("Stop after request"))
})

afterEach(cleanup)

function projectWithBlockingProblem(): Project {
  const layout = layoutFixture()
  const submission = submissionFixture("10000000-0000-4000-8000-000000000001", 1)
  const pageId = `submission:${submission.id}`

  return {
    id: layout.projectId,
    title: "Test book",
    occasion: null,
    state: "closed",
    formSchema: completeForm,
    layouts: [layout],
    submissions: [submission],
    bookStatus: "current",
    archivedAt: null,
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
              id: `${pageId}:text:outside-print-area`,
              code: "outside-print-area",
              pageId,
              elementId: "text",
              message: "Text is outside the safe area.",
              blocking: true,
            },
          ],
        },
      ],
      sourceFingerprint: "current-source",
      generatedAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:00.000Z",
    },
  } as Project
}

describe("print export blocking problem override", () => {
  it("requires an explicit opt-in and confirmation before requesting the export", async () => {
    render(<ExportPanel project={projectWithBlockingProblem()} />)

    const exportButton = screen.getByRole("button", { name: "Export PDF + report" })
    expect((exportButton as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole("switch", { name: "Export despite blocking problems" }))
    expect(screen.getByText("1 blocking page problem accepted")).toBeTruthy()
    expect(
      (screen.getByRole("button", { name: "Export PDF + report" }) as HTMLButtonElement).disabled
    ).toBe(false)

    fireEvent.click(screen.getByRole("button", { name: "Export PDF + report" }))
    expect(exportProject).not.toHaveBeenCalled()

    fireEvent.click(await screen.findByRole("button", { name: "Export anyway" }))

    await waitFor(() =>
      expect(exportProject).toHaveBeenCalledExactlyOnceWith(
        "99999999-9999-4999-8999-999999999999",
        {
          marks: false,
          allowBlockingProblems: true,
          reviewedBookFingerprint: "current-source",
        }
      )
    )
  })
})
