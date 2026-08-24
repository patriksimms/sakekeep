import { describe, expect, it, vi } from "vitest"

import { type Project } from "#/domain/types.ts"
import { completeForm, cycleSettings, layoutFixture, submissionFixture } from "#/test/fixtures.ts"

const getProject = vi.fn()

vi.mock("./repository.ts", () => ({
  getProject: (...args: unknown[]) => getProject(...args),
  recordExport: vi.fn(),
}))

const { exportProject } = await import("./export-service.ts")

function currentProject(): Project {
  const layout = layoutFixture()
  const submission = submissionFixture("10000000-0000-4000-8000-000000000001", 1)

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
          id: `submission:${submission.id}`,
          kind: "submission",
          submissionId: submission.id,
          layoutId: layout.id,
          problems: [
            {
              id: "new-book-problem",
              code: "outside-print-area",
              pageId: `submission:${submission.id}`,
              elementId: "text",
              message: "Text is outside the safe area.",
              blocking: true,
            },
          ],
        },
      ],
      sourceFingerprint: "new-book",
      generatedAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:00.000Z",
    },
  } as Project
}

describe("export blocking problem override", () => {
  it("rejects an override accepted for a different generated book", async () => {
    getProject.mockResolvedValue(currentProject())

    await expect(
      exportProject("99999999-9999-4999-8999-999999999999", {
        marks: false,
        allowBlockingProblems: true,
        reviewedBookFingerprint: "reviewed-book",
      })
    ).rejects.toMatchObject({
      status: 409,
      message:
        "The book changed after you accepted its problems. Review it again before exporting.",
    })
  })
})
