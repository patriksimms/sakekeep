// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { type Project } from "#/domain/types.ts"
import { completeForm, submissionFixture } from "#/test/fixtures.ts"
import { ApiError, projectApi } from "#/lib/api.ts"

import { SubmissionsPanel } from "./submissions-panel.tsx"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

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

  it("reviews and confirms a text correction before saving it", async () => {
    const currentProject = project()
    const updatedProject = project()
    updatedProject.submissions![0]!.answers.name = "Person one"
    updatedProject.submissions![0]!.revision = 1
    const updateSubmission = vi
      .spyOn(projectApi, "updateSubmission")
      .mockResolvedValue(updatedProject)
    const onProjectChange = vi.fn()
    render(
      <SubmissionsPanel
        project={currentProject}
        onProjectChange={onProjectChange}
        onRefresh={() => undefined}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /Person 1/ }))
    fireEvent.click(screen.getByRole("button", { name: "Edit response" }))
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Person one" } })
    fireEvent.click(screen.getByRole("button", { name: "Review changes" }))

    expect(screen.getByRole("alertdialog").textContent).toContain(
      "You are changing content submitted by a contributor."
    )
    expect(screen.getByRole("alertdialog").textContent).toContain("Your name")
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() =>
      expect(updateSubmission).toHaveBeenCalledWith("project-id", "submission-id", {
        expectedRevision: 0,
        answers: { name: "Person one" },
      })
    )
    expect(onProjectChange).toHaveBeenCalledWith(updatedProject)
  })

  it("keeps the starting revision when refreshed during an edit", async () => {
    const currentProject = project()
    const refreshedProject = project()
    refreshedProject.submissions![0]!.answers.name = "Another organizer's correction"
    refreshedProject.submissions![0]!.revision = 1
    const updateSubmission = vi
      .spyOn(projectApi, "updateSubmission")
      .mockRejectedValue(
        new ApiError(409, "This response changed while you were editing it. Refresh and try again.")
      )
    const onProjectChange = vi.fn()
    const { rerender } = render(
      <SubmissionsPanel
        project={currentProject}
        onProjectChange={onProjectChange}
        onRefresh={() => undefined}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /Person 1/ }))
    fireEvent.click(screen.getByRole("button", { name: "Edit response" }))
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "My correction" } })
    rerender(
      <SubmissionsPanel
        project={refreshedProject}
        onProjectChange={onProjectChange}
        onRefresh={() => undefined}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Review changes" }))
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() =>
      expect(updateSubmission).toHaveBeenCalledWith("project-id", "submission-id", {
        expectedRevision: 0,
        answers: { name: "My correction" },
      })
    )
    expect(onProjectChange).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit response" })).toBeTruthy())
  })

  it("validates edited text before opening the confirmation", () => {
    render(
      <SubmissionsPanel
        project={project()}
        onProjectChange={() => undefined}
        onRefresh={() => undefined}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /Person 1/ }))
    fireEvent.click(screen.getByRole("button", { name: "Edit response" }))
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Review changes" }))

    expect(screen.getByText("This question is required.")).toBeTruthy()
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("shows who changed an answer and keeps the original value visible", () => {
    const editedProject = project()
    editedProject.submissions![0]!.edits = [
      {
        id: "edit-id",
        editorName: "Patrik Simms",
        editedAt: "2026-08-24T18:00:00.000Z",
        changes: [
          { questionId: "name", previousValue: "Persno 1", newValue: "Person 1" },
          { questionId: "website", previousValue: "", newValue: "https://example.com" },
          { questionId: "memory", previousValue: "Removed memory", newValue: "  " },
        ],
      },
    ]
    render(
      <SubmissionsPanel
        project={editedProject}
        onProjectChange={() => undefined}
        onRefresh={() => undefined}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /Person 1/ }))
    expect(screen.getByRole("button", { name: /Person 1.*Edited/ })).toBeTruthy()
    expect(screen.getByText("Edit history")).toBeTruthy()
    expect(screen.getByText(/Patrik Simms/)).toBeTruthy()
    expect(screen.getByText("Persno 1")).toBeTruthy()
    expect(
      screen.getAllByText("No answer").filter((element) => element.tagName === "SPAN")
    ).toHaveLength(2)
    expect(screen.getByText("https://example.com")).toBeTruthy()
    expect(screen.getByText("Removed memory")).toBeTruthy()
    expect(
      screen
        .getAllByText("Person 1")
        .filter((element) => element.tagName === "SPAN" && !element.hasAttribute("class"))
    ).toHaveLength(1)
  })

  it("does not offer edits before collection closes or while archived", () => {
    const collecting = project()
    collecting.state = "collecting"
    const { rerender } = render(
      <SubmissionsPanel
        project={collecting}
        onProjectChange={() => undefined}
        onRefresh={() => undefined}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /Person 1/ }))
    expect(screen.queryByRole("button", { name: "Edit response" })).toBeNull()

    const archived = project()
    archived.archivedAt = "2026-08-24T18:00:00.000Z"
    rerender(
      <SubmissionsPanel
        project={archived}
        onProjectChange={() => undefined}
        onRefresh={() => undefined}
      />
    )
    expect(screen.queryByRole("button", { name: "Edit response" })).toBeNull()
  })
})
