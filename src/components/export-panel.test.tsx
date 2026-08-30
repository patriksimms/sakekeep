// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type ExportArtifact, type Project } from "#/domain/types.ts"
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

function projectWithoutProblems(): Project {
  const project = projectWithBlockingProblem()
  const book = project.book!
  return {
    ...project,
    book: { ...book, pages: book.pages.map((page) => ({ ...page, problems: [] })) },
  }
}

function artifactFixture(): ExportArtifact {
  const id = "55555555-5555-4555-8555-555555555555"
  return {
    id,
    pdfUrl: `/api/exports/${id}?file=pdf`,
    reportUrl: `/api/exports/${id}?file=report`,
    pagePdfZipUrl: `/api/exports/${id}?file=page-pdfs`,
    pageJpegZipUrl: `/api/exports/${id}?file=page-jpegs`,
    report: {
      sourceFingerprint: "current-source",
      checks: [],
      pdfx: { limitation: "Structure only." },
    },
  } as unknown as ExportArtifact
}

describe("print export downloads", () => {
  it("offers every format after one export, without asking up front", async () => {
    exportProject.mockResolvedValue(artifactFixture())
    render(<ExportPanel project={projectWithoutProblems()} />)

    expect(screen.queryByRole("switch", { name: /per page/ })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Export book" }))

    await waitFor(() =>
      expect(exportProject).toHaveBeenCalledExactlyOnceWith(
        "99999999-9999-4999-8999-999999999999",
        {
          marks: false,
          allowBlockingProblems: false,
          reviewedBookFingerprint: "current-source",
        }
      )
    )

    const id = "55555555-5555-4555-8555-555555555555"
    for (const [name, file] of [
      ["Complete book (PDF)", "pdf"],
      ["One PDF per page (ZIP)", "page-pdfs"],
      ["One JPEG per page (ZIP)", "page-jpegs"],
      ["Preflight report (TXT)", "report"],
    ]) {
      expect(
        (
          await screen.findByRole("link", { name: new RegExp(name!.replace(/[()]/g, "\\$&")) })
        ).getAttribute("href")
      ).toBe(`/api/exports/${id}?file=${file}`)
    }
  })
})

describe("print export blocking problem override", () => {
  it("requires an explicit opt-in and confirmation before requesting the export", async () => {
    render(<ExportPanel project={projectWithBlockingProblem()} />)

    const exportButton = screen.getByRole("button", { name: "Export book" })
    expect((exportButton as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole("switch", { name: "Export despite blocking problems" }))
    expect(screen.getByText("1 blocking page problem accepted")).toBeTruthy()
    expect(
      (screen.getByRole("button", { name: "Export book" }) as HTMLButtonElement).disabled
    ).toBe(false)

    fireEvent.click(screen.getByRole("button", { name: "Export book" }))
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
