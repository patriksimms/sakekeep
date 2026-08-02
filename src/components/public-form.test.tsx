// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FORM_SCHEMA_VERSION, type FormSchema } from "#/domain/types.ts"

const loadContributorDraft = vi.fn(async () => undefined)
const saveContributorDraft = vi.fn(async () => {})
const clearContributorDraft = vi.fn(async () => {})

vi.mock("#/lib/contributor-drafts.ts", () => ({
  loadContributorDraft: () => loadContributorDraft(),
  saveContributorDraft: () => saveContributorDraft(),
  clearContributorDraft: () => clearContributorDraft(),
}))

const { PublicForm } = await import("./public-form.tsx")

const formSchema: FormSchema = {
  version: FORM_SCHEMA_VERSION,
  questions: [
    {
      id: "memory",
      type: "multiline",
      prompt: "A memory",
      required: true,
      characterLimit: 500,
    },
    {
      id: "photos",
      type: "images",
      prompt: "Photos",
      required: false,
      maxImages: 2,
    },
  ],
}

function imageFile(name: string, type = "image/png") {
  return new File(["binary"], name, { type })
}

function dropZone() {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input?.parentElement) throw new Error("The image drop zone is missing.")
  return input.parentElement
}

function consentCheckbox() {
  return screen.getByRole("checkbox", { name: /I agree that my answers/ })
}

async function renderForm() {
  render(<PublicForm token="share-token" title="Mina’s book" formSchema={formSchema} />)
  return (await screen.findByRole("button", { name: "Submit once" })) as HTMLButtonElement
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn())
  URL.createObjectURL = vi.fn(() => "blob:preview")
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("PublicForm privacy consent", () => {
  it("keeps submission disabled until the contributor consents", async () => {
    const submit = await renderForm()
    expect(submit.disabled).toBe(true)

    fireEvent.click(consentCheckbox())
    await waitFor(() => expect(submit.disabled).toBe(false))

    fireEvent.click(consentCheckbox())
    await waitFor(() => expect(submit.disabled).toBe(true))
  })

  it("links to the privacy policy next to the consent checkbox", async () => {
    await renderForm()

    expect(screen.getByRole("link", { name: "privacy policy" }).getAttribute("href")).toBe(
      "/privacy"
    )
  })

  it("does not submit while consent is missing", async () => {
    const submit = await renderForm()
    fireEvent.change(screen.getByLabelText(/A memory/), {
      target: { value: "A recovered afternoon." },
    })

    fireEvent.submit(submit.closest("form")!)

    await waitFor(() => expect(submit.disabled).toBe(true))
    expect(fetch).not.toHaveBeenCalled()
  })

  it("starts unconsented even when a draft is restored", async () => {
    loadContributorDraft.mockResolvedValueOnce({
      token: "share-token",
      answers: { memory: "A restored memory." },
      files: {},
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
      updatedAt: new Date().toISOString(),
    } as never)

    const submit = await renderForm()

    expect(await screen.findByText("Draft restored")).toBeTruthy()
    expect(consentCheckbox().getAttribute("aria-checked")).toBe("false")
    expect(submit.disabled).toBe(true)
  })
})

describe("PublicForm image drag and drop", () => {
  it("accepts dropped images", async () => {
    await renderForm()

    fireEvent.drop(dropZone(), { dataTransfer: { files: [imageFile("holiday.png")] } })

    expect(await screen.findByRole("button", { name: "Remove holiday.png" })).toBeTruthy()
  })

  it("ignores dropped files that are not supported images", async () => {
    await renderForm()

    fireEvent.drop(dropZone(), {
      dataTransfer: { files: [new File(["notes"], "notes.txt", { type: "text/plain" })] },
    })

    expect(
      await screen.findByText("Only JPEG, PNG, WebP, HEIF, or HEIC images can be added.")
    ).toBeTruthy()
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull()
  })

  it("never accepts more images than the question allows", async () => {
    await renderForm()

    fireEvent.drop(dropZone(), {
      dataTransfer: {
        files: [imageFile("one.png"), imageFile("two.jpg", "image/jpeg"), imageFile("three.webp")],
      },
    })

    expect(await screen.findByRole("button", { name: "Remove one.png" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Remove two.jpg" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Remove three.webp" })).toBeNull()
    expect(screen.getByText("Only 2 images can be added here.")).toBeTruthy()
  })

  it("marks the drop zone while a file is dragged over it", async () => {
    await renderForm()
    const zone = dropZone()

    fireEvent.dragOver(zone)
    await waitFor(() => expect(zone.getAttribute("data-dragging")).toBe("true"))

    fireEvent.dragLeave(zone)
    await waitFor(() => expect(zone.getAttribute("data-dragging")).toBeNull())
  })
})
