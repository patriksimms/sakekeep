// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FORM_SCHEMA_VERSION, type Project } from "#/domain/types.ts"
import { ApiError } from "#/lib/api.ts"

const update = vi.fn()

vi.mock("#/lib/api.ts", async () => {
  const actual = await vi.importActual<typeof import("#/lib/api.ts")>("#/lib/api.ts")
  return {
    ...actual,
    projectApi: { ...actual.projectApi, update: (...args: unknown[]) => update(...args) },
  }
})

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const { FormBuilder } = await import("./form-builder.tsx")

function project(): Project {
  return {
    id: "p1",
    title: "Test",
    occasion: null,
    state: "draft",
    shareUrl: null,
    formRevision: 0,
    formSchema: {
      version: FORM_SCHEMA_VERSION,
      questions: [
        { id: "q0", type: "single-line", prompt: "First", required: false },
        { id: "q1", type: "single-line", prompt: "Second", required: false },
      ],
    },
    bookStatus: "not-generated",
    layouts: [],
    book: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  } as unknown as Project
}

function rejection(path: string, message: string) {
  return new ApiError(422, "The request contains invalid data.", {
    issues: [{ path, message }],
  })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  update.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** Type into a prompt and let the 700 ms autosave debounce elapse. */
async function editPrompt(index: number, value: string) {
  fireEvent.change(screen.getAllByLabelText("Question")[index]!, { target: { value } })
  await vi.advanceTimersByTimeAsync(800)
}

describe("FormBuilder inline validation errors", () => {
  it("renders a rejected save's issue on the input it belongs to", async () => {
    update.mockRejectedValue(
      rejection("formSchema.questions.1.prompt", "Use no more than 500 characters.")
    )
    render(<FormBuilder project={project()} onProjectChange={vi.fn()} />)

    await editPrompt(1, "way too long")

    await waitFor(() => {
      expect(screen.getByText("Use no more than 500 characters.")).toBeTruthy()
    })
    // The issue names question index 1, so only the second prompt is marked.
    const prompts = screen.getAllByLabelText("Question")
    expect(prompts[1]!.getAttribute("aria-invalid")).toBe("true")
    expect(prompts[0]!.getAttribute("aria-invalid")).toBeNull()
  })

  it("clears the inline error as soon as the offending field is edited", async () => {
    update.mockRejectedValueOnce(
      rejection("formSchema.questions.1.prompt", "Use no more than 500 characters.")
    )
    render(<FormBuilder project={project()} onProjectChange={vi.fn()} />)

    await editPrompt(1, "way too long")
    await waitFor(() => {
      expect(screen.getByText("Use no more than 500 characters.")).toBeTruthy()
    })

    update.mockResolvedValue({ ...project(), formRevision: 1 })
    fireEvent.change(screen.getAllByLabelText("Question")[1]!, { target: { value: "Fixed" } })

    await waitFor(() => {
      expect(screen.queryByText("Use no more than 500 characters.")).toBeNull()
    })
  })

  it("does not pin a superseded rejection onto whichever question now holds that index", async () => {
    // The save for the edit below is still in flight when the questions are reordered.
    let rejectInFlight: ((error: unknown) => void) | undefined
    update.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectInFlight = reject
        })
    )
    render(<FormBuilder project={project()} onProjectChange={vi.fn()} />)

    await editPrompt(1, "way too long")
    expect(rejectInFlight).toBeDefined()

    // Reorder, so index 1 now refers to the question that was never invalid. The queued save for
    // this edit is suppressed while the first is still in flight, so nothing else can clear the
    // errors afterwards — whatever the rejection sets is what the organizer is left looking at.
    fireEvent.click(screen.getAllByLabelText("Move question up")[1]!)
    expect(update).toHaveBeenCalledTimes(1)

    rejectInFlight!(rejection("formSchema.questions.1.prompt", "Use no more than 500 characters."))
    await vi.advanceTimersByTimeAsync(50)

    // The stale response must not mark the question that now sits at index 1.
    expect(update).toHaveBeenCalledTimes(1)
    expect(screen.queryByText("Use no more than 500 characters.")).toBeNull()
    for (const prompt of screen.getAllByLabelText("Question")) {
      expect(prompt.getAttribute("aria-invalid")).toBeNull()
    }
  })
})

describe("FormBuilder pre-publish panel", () => {
  it("says which question blocks publishing when the message alone cannot", async () => {
    update.mockResolvedValue({ ...project(), formRevision: 1 })
    render(<FormBuilder project={project()} onProjectChange={vi.fn()} />)

    await editPrompt(0, "")

    await waitFor(() => {
      expect(screen.getByText("Question 1: Enter a question prompt.")).toBeTruthy()
    })
    // A blank prompt is a publish concern only: it must not flag the field mid-edit.
    expect(screen.getAllByLabelText("Question")[0]!.getAttribute("aria-invalid")).toBeNull()
  })
})
