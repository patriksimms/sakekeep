import { openDB, type DBSchema } from "idb"

import { type SubmissionAnswers } from "#/domain/types.ts"

export interface ContributorDraft {
  token: string
  idempotencyKey: string
  answers: SubmissionAnswers
  files: Record<string, File[]>
  updatedAt: string
}

interface SakekeepDraftDatabase extends DBSchema {
  drafts: {
    key: string
    value: ContributorDraft
  }
}

function database() {
  if (typeof indexedDB === "undefined") {
    throw new Error("Contributor drafts are only available in the browser.")
  }
  return openDB<SakekeepDraftDatabase>("sakekeep-contributor-drafts", 1, {
    upgrade(db) {
      db.createObjectStore("drafts", { keyPath: "token" })
    },
  })
}

export async function loadContributorDraft(token: string): Promise<ContributorDraft | undefined> {
  return (await database()).get("drafts", token)
}

export async function saveContributorDraft(draft: ContributorDraft): Promise<void> {
  await (await database()).put("drafts", draft)
}

export async function clearContributorDraft(token: string): Promise<void> {
  await (await database()).delete("drafts", token)
}
