import { afterEach, describe, expect, it } from "vitest"

import { HttpError } from "./http.ts"
import {
  archiveProject,
  closeProject,
  createLayout,
  createProject,
  createSubmissionRecord,
  deleteProject,
  duplicateProject,
  findPublicProject,
  listProjects,
  publishProject,
  unarchiveProject,
  updateProject,
} from "./repository.ts"
import { shareTokenForProject } from "./share-token.ts"
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

describe("project archiving", () => {
  it("archives a draft without changing its state and blocks edits until unarchived", async () => {
    const project = await createProject({ title: "Archived draft" })
    createdProjectIds.add(project.id)

    const archived = await archiveProject(project.id)
    expect(archived.state).toBe("draft")
    expect(archived.archivedAt).toEqual(expect.any(String))

    await expect(
      updateProject({
        projectId: project.id,
        formSchema: completeForm,
        expectedRevision: 0,
      })
    ).rejects.toMatchObject({ status: 409 })
    await expect(updateProject({ projectId: project.id, title: "Renamed" })).rejects.toMatchObject({
      status: 409,
    })
    await expect(publishProject(project.id)).rejects.toMatchObject({ status: 409 })
    await expect(archiveProject(project.id)).rejects.toMatchObject({ status: 409 })

    const restored = await unarchiveProject(project.id)
    expect(restored.archivedAt).toBeNull()
    expect(restored.state).toBe("draft")
    await expect(unarchiveProject(project.id)).rejects.toMatchObject({ status: 409 })
    await expect(
      updateProject({
        projectId: project.id,
        formSchema: completeForm,
        expectedRevision: 0,
      })
    ).resolves.toMatchObject({ formRevision: 1 })
  })

  it("closes the share link while a collecting project is archived and reopens it afterwards", async () => {
    const project = await createProject({ title: "Archived collection" })
    createdProjectIds.add(project.id)
    await updateProject({
      projectId: project.id,
      formSchema: completeForm,
      expectedRevision: 0,
    })
    await publishProject(project.id)
    const token = shareTokenForProject(project.id)
    expect((await findPublicProject(token)).status).toBe("collecting")

    await archiveProject(project.id)
    expect((await findPublicProject(token)).status).toBe("closed")
    const submission = {
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
    await expect(createSubmissionRecord(submission)).rejects.toMatchObject({ status: 409 })
    await expect(closeProject(project.id)).rejects.toMatchObject({ status: 409 })

    const restored = await unarchiveProject(project.id)
    expect(restored.state).toBe("collecting")
    expect((await findPublicProject(token)).status).toBe("collecting")
    await expect(createSubmissionRecord(submission)).resolves.toMatchObject({ created: true })
  })

  it("keeps archived projects listed and blocks layout authoring on a closed project", async () => {
    const project = await createProject({ title: "Archived closed" })
    createdProjectIds.add(project.id)
    await updateProject({
      projectId: project.id,
      formSchema: completeForm,
      expectedRevision: 0,
    })
    await publishProject(project.id)
    await closeProject(project.id)
    await archiveProject(project.id)

    await expect(createLayout(project.id)).rejects.toMatchObject({ status: 409 })

    const listed = (await listProjects()).find((entry) => entry.id === project.id)
    expect(listed?.state).toBe("closed")
    expect(listed?.archivedAt).toEqual(expect.any(String))

    // Duplicating an archived project is deliberately allowed: the copy is a fresh, unarchived draft.
    const duplicate = await duplicateProject(project.id)
    createdProjectIds.add(duplicate.id)
    expect(duplicate).toMatchObject({ state: "draft", archivedAt: null })
  })
})
