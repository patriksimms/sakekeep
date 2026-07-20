import { afterEach, describe, expect, it } from "vitest"

import { HttpError } from "./http.ts"
import {
  closeProject,
  createProject,
  createSubmissionRecord,
  deleteProject,
  duplicateProject,
  publishProject,
  updateProject,
} from "./repository.ts"
import { completeForm } from "../test/fixtures.ts"

const createdProjectIds = new Set<string>()

afterEach(async () => {
  for (const id of createdProjectIds) {
    await deleteProject(id).catch(() => undefined)
  }
  createdProjectIds.clear()
})

describe("repository state machine", () => {
  it("uses optimistic form revisions to reject concurrent autosaves", async () => {
    const project = await createProject({ title: "Autosave race" })
    createdProjectIds.add(project.id)
    const saves = await Promise.allSettled([
      updateProject({
        projectId: project.id,
        formSchema: completeForm,
        expectedRevision: 0,
      }),
      updateProject({
        projectId: project.id,
        formSchema: {
          ...completeForm,
          questions: completeForm.questions.slice(0, 1),
        },
        expectedRevision: 0,
      }),
    ])
    expect(saves.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    const rejection = saves.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    )
    expect(rejection).toBeDefined()
    expect(rejection!.reason).toBeInstanceOf(HttpError)
    expect((rejection!.reason as HttpError).status).toBe(409)
  })

  it("freezes published forms, accepts a retry once, and closes permanently", async () => {
    const project = await createProject({ title: "Lifecycle" })
    createdProjectIds.add(project.id)
    await updateProject({
      projectId: project.id,
      formSchema: completeForm,
      expectedRevision: 0,
    })
    const published = await publishProject(project.id)
    expect(published.state).toBe("collecting")
    await expect(
      updateProject({
        projectId: project.id,
        formSchema: completeForm,
        expectedRevision: 1,
      })
    ).rejects.toMatchObject({ status: 409 })

    const input = {
      projectId: project.id,
      idempotencyKey: crypto.randomUUID(),
      answers: {
        name: "Nora",
        memory: "A memory",
        role: ["friend"],
        traits: ["kind"],
      },
      pendingAssets: [],
    }
    const attempts = await Promise.all([
      createSubmissionRecord(input),
      createSubmissionRecord(input),
    ])
    expect(new Set(attempts.map((attempt) => attempt.submission.id)).size).toBe(1)
    expect(attempts.filter((attempt) => attempt.created)).toHaveLength(1)

    const closed = await closeProject(project.id)
    expect(closed.state).toBe("closed")
    await expect(
      createSubmissionRecord({ ...input, idempotencyKey: crypto.randomUUID() })
    ).rejects.toMatchObject({ status: 409 })
    await expect(closeProject(project.id)).rejects.toMatchObject({ status: 409 })

    const duplicate = await duplicateProject(project.id)
    createdProjectIds.add(duplicate.id)
    expect(duplicate).toMatchObject({
      state: "draft",
      submissionCount: 0,
      shareUrl: null,
    })
  })
})
