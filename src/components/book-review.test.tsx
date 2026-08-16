// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { type Project } from "#/domain/types.ts"
import { completeForm, cycleSettings, layoutFixture, submissionFixture } from "#/test/fixtures.ts"

import { BookReview } from "./book-review.tsx"

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
})
