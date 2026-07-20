import "fake-indexeddb/auto"

import { describe, expect, it } from "vitest"

import {
  clearContributorDraft,
  loadContributorDraft,
  saveContributorDraft,
} from "./contributor-drafts.ts"

describe("contributor drafts", () => {
  it("persists answers and image files by share token, then clears success", async () => {
    const token = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    const file = new File(["image bytes"], "memory.jpg", {
      type: "image/jpeg",
    })
    await saveContributorDraft({
      token,
      idempotencyKey: "retry-key",
      answers: { name: "Nora", memory: "Recovered after refresh" },
      files: { photos: [file] },
      updatedAt: "2026-07-18T00:00:00.000Z",
    })
    const recovered = await loadContributorDraft(token)
    expect(recovered).toMatchObject({
      token,
      idempotencyKey: "retry-key",
      answers: { name: "Nora", memory: "Recovered after refresh" },
    })
    expect(recovered?.files.photos?.[0]).toMatchObject({
      name: "memory.jpg",
      type: "image/jpeg",
      size: 11,
    })
    await clearContributorDraft(token)
    expect(await loadContributorDraft(token)).toBeUndefined()
  })
})
