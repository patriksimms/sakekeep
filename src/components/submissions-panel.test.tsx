// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { type Project } from "#/domain/types.ts"
import { completeForm, submissionFixture } from "#/test/fixtures.ts"

import { SubmissionsPanel } from "./submissions-panel.tsx"

afterEach(cleanup)

function project(): Project {
  return {
    id: "project-id",
    title: "Test project",
    occasion: null,
    state: "closed",
    formSchema: completeForm,
    formRevision: 1,
    shareUrl: null,
    submissionCount: 1,
    bookStatus: "not-generated",
    pageFormat: "a5",
    pageOrientation: "landscape",
    layouts: [],
    book: null,
    submissions: [submissionFixture("submission-id", 1)],
    archivedAt: null,
    createdAt: "2026-08-23T12:00:00.000Z",
    updatedAt: "2026-08-23T12:00:00.000Z",
  }
}

describe("SubmissionsPanel", () => {
  it("shows the contributor name in the response list", () => {
    render(
      <SubmissionsPanel
        project={project()}
        onProjectChange={() => undefined}
        onRefresh={() => undefined}
      />
    )

    expect(screen.getByText("Person 1")).toBeTruthy()
    expect(screen.queryByText("Response 1")).toBeNull()
  })

  it("keeps the numbered label when the form has no name field", () => {
    const withoutName = project()
    withoutName.formSchema = {
      ...withoutName.formSchema,
      questions: withoutName.formSchema.questions.filter((question) => question.id !== "name"),
    }

    render(
      <SubmissionsPanel
        project={withoutName}
        onProjectChange={() => undefined}
        onRefresh={() => undefined}
      />
    )

    expect(screen.getByText("Response 1")).toBeTruthy()
  })
})
