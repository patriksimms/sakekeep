import { afterEach, describe, expect, it } from "vitest"

import { HttpError } from "./http.ts"
import {
  archiveProject,
  cleanupOrphanedObjects,
  closeProject,
  createLayout,
  createProject,
  createSubmissionRecord,
  deleteLayout,
  deleteProject,
  duplicateLayout,
  duplicateProject,
  findPublicProject,
  generateProjectBook,
  getProject,
  listProjects,
  publishProject,
  recordExport,
  reorderLayouts,
  reserveObjects,
  setAssetFocalPoint,
  setProjectPageFormat,
  unarchiveProject,
  updateProject,
  updateProjectBook,
  updateSubmissionTextAnswers,
} from "./repository.ts"
import { db } from "./db/index.ts"
import { assetTombstones, books } from "./db/schema.ts"
import { eq, inArray, sql } from "drizzle-orm"
import { photoFocalPoint } from "../domain/photo-focus.ts"
import { FORM_SCHEMA_VERSION, type ExportReport, type FormSchema } from "../domain/types.ts"
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
  it("edits closed response text with history and stale-book protection", async () => {
    const project = await createProject({ title: "Response corrections" })
    createdProjectIds.add(project.id)
    await updateProject({
      projectId: project.id,
      formSchema: completeForm,
      expectedRevision: 0,
    })
    await publishProject(project.id)
    const { submission } = await createSubmissionRecord({
      projectId: project.id,
      idempotencyKey: crypto.randomUUID(),
      answers: {
        name: "Nroa",
        website: "https://example.com",
        memory: "A memroy",
        role: ["friend"],
        traits: ["kind"],
        photos: [],
      },
      pendingAssets: [],
    })
    const editor = { userId: "user-1", name: "Patrik Simms" }

    await expect(
      updateSubmissionTextAnswers({
        projectId: project.id,
        submissionId: submission.id,
        expectedRevision: 0,
        answers: { name: "Nora" },
        editor,
      })
    ).rejects.toMatchObject({ status: 409 })

    await closeProject(project.id)
    await createLayout(project.id)
    await generateProjectBook(project.id, {
      mode: "cycle",
      seed: "response-edit",
      manualAssignments: {},
      resolutionOverrides: [],
    })

    await expect(
      updateSubmissionTextAnswers({
        projectId: project.id,
        submissionId: submission.id,
        expectedRevision: 0,
        answers: { name: "" },
        editor,
      })
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      updateSubmissionTextAnswers({
        projectId: project.id,
        submissionId: submission.id,
        expectedRevision: 0,
        answers: { name: "x".repeat(41) },
        editor,
      })
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      updateSubmissionTextAnswers({
        projectId: project.id,
        submissionId: submission.id,
        expectedRevision: 0,
        answers: { role: "family" },
        editor,
      })
    ).rejects.toMatchObject({ status: 422 })

    const updated = await updateSubmissionTextAnswers({
      projectId: project.id,
      submissionId: submission.id,
      expectedRevision: 0,
      answers: { name: "Nora", memory: "A memory" },
      editor,
    })
    expect(updated.bookStatus).toBe("stale")
    expect(updated.submissions?.[0]).toMatchObject({
      revision: 1,
      answers: { name: "Nora", memory: "A memory" },
      edits: [
        {
          editorName: "Patrik Simms",
          changes: [
            { questionId: "name", previousValue: "Nroa", newValue: "Nora" },
            { questionId: "memory", previousValue: "A memroy", newValue: "A memory" },
          ],
        },
      ],
    })

    await expect(
      updateSubmissionTextAnswers({
        projectId: project.id,
        submissionId: submission.id,
        expectedRevision: 0,
        answers: { name: "Nora M." },
        editor,
      })
    ).rejects.toMatchObject({ status: 409 })

    await archiveProject(project.id)
    await expect(
      updateSubmissionTextAnswers({
        projectId: project.id,
        submissionId: submission.id,
        expectedRevision: 1,
        answers: { name: "Nora M." },
        editor,
      })
    ).rejects.toMatchObject({ status: 409 })
  })

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

  it("deletes a layout assigned to generated pages and requires regeneration", async () => {
    const project = await createProject({ title: "Delete assigned layout" })
    createdProjectIds.add(project.id)
    await updateProject({
      projectId: project.id,
      formSchema: completeForm,
      expectedRevision: 0,
    })
    await publishProject(project.id)
    await createSubmissionRecord({
      projectId: project.id,
      idempotencyKey: crypto.randomUUID(),
      answers: {
        name: "Nora",
        memory: "A memory",
        role: ["friend"],
        traits: ["kind"],
      },
      pendingAssets: [],
    })
    await closeProject(project.id)
    const assignedLayout = await createLayout(project.id)
    const remainingLayout = await createLayout(project.id)
    const settings = {
      mode: "cycle" as const,
      seed: "delete-layout",
      manualAssignments: {},
      resolutionOverrides: [],
    }
    const generated = await generateProjectBook(project.id, settings)
    expect(generated.pages).toEqual([
      expect.objectContaining({ kind: "submission", layoutId: assignedLayout.id }),
    ])

    await deleteLayout(project.id, assignedLayout.id)

    const staleProject = await getProject(project.id)
    expect(staleProject.bookStatus).toBe("stale")
    expect(staleProject.layouts.map((layout) => layout.id)).toEqual([remainingLayout.id])
    expect(staleProject.book?.pages).toEqual([
      expect.objectContaining({ kind: "submission", layoutId: assignedLayout.id }),
    ])

    const regenerated = await generateProjectBook(project.id, settings)
    expect(regenerated.pages).toEqual([
      expect.objectContaining({ kind: "submission", layoutId: remainingLayout.id }),
    ])
    expect((await getProject(project.id)).bookStatus).toBe("current")
  })

  it("resizes same-orientation layouts and explicitly resets orientation changes", async () => {
    const project = await createProject({ title: "Page formats" })
    createdProjectIds.add(project.id)
    await updateProject({
      projectId: project.id,
      formSchema: completeForm,
      expectedRevision: 0,
    })
    await publishProject(project.id)
    await createSubmissionRecord({
      projectId: project.id,
      idempotencyKey: crypto.randomUUID(),
      answers: {
        name: "Nora",
        memory: "A memory",
        role: ["friend"],
        traits: ["kind"],
      },
      pendingAssets: [],
    })
    await closeProject(project.id)
    const first = await createLayout(project.id, "Decorated", "geometric-collage")
    const second = await createLayout(project.id, "Blank")
    const settings = {
      mode: "cycle" as const,
      seed: "page-formats",
      manualAssignments: {},
      resolutionOverrides: [],
    }
    await generateProjectBook(project.id, settings)

    const resized = await setProjectPageFormat({
      projectId: project.id,
      pageFormat: "a4",
      pageOrientation: "landscape",
    })
    expect(resized).toMatchObject({
      pageFormat: "a4",
      pageOrientation: "landscape",
      bookStatus: "stale",
    })
    expect(resized.layouts.map(({ id }) => id)).toEqual([first.id, second.id])
    expect(resized.layouts[0]?.schema.trim).toEqual({ widthMm: 297, heightMm: 210 })
    expect(resized.layouts[0]?.schema.elements[0]?.geometry.width).toBeGreaterThan(72)

    await generateProjectBook(project.id, settings)
    await expect(
      setProjectPageFormat({
        projectId: project.id,
        pageFormat: "a4",
        pageOrientation: "portrait",
      })
    ).rejects.toMatchObject({ status: 409, details: { layoutCount: 2 } })
    expect(await getProject(project.id)).toMatchObject({
      pageFormat: "a4",
      pageOrientation: "landscape",
      bookStatus: "current",
    })

    const reset = await setProjectPageFormat({
      projectId: project.id,
      pageFormat: "a4",
      pageOrientation: "portrait",
      resetLayouts: true,
    })
    expect(reset).toMatchObject({
      pageFormat: "a4",
      pageOrientation: "portrait",
      bookStatus: "stale",
      layouts: [
        expect.objectContaining({
          name: "Layout 1",
          position: 0,
          schema: expect.objectContaining({
            trim: { widthMm: 210, heightMm: 297 },
            elements: [],
          }),
        }),
      ],
    })
  })
})

describe("photo crop centres", () => {
  async function projectWithPhoto() {
    const project = await createProject({ title: "Crop centres" })
    createdProjectIds.add(project.id)
    await updateProject({
      projectId: project.id,
      formSchema: completeForm,
      expectedRevision: 0,
    })
    await publishProject(project.id)
    const assetId = crypto.randomUUID()
    await createSubmissionRecord({
      projectId: project.id,
      idempotencyKey: crypto.randomUUID(),
      answers: { name: "Nora", memory: "A memory", role: ["friend"], traits: ["kind"] },
      pendingAssets: [
        {
          id: assetId,
          questionId: "photos",
          objectKey: `projects/${project.id}/master.jpg`,
          previewObjectKey: `projects/${project.id}/preview.jpg`,
          masterMimeType: "image/jpeg",
          sourceMimeType: "image/jpeg",
          sourceName: "portrait.jpg",
          sizeBytes: 2_048,
          width: 1_200,
          height: 1_600,
        },
      ],
    })
    return { projectId: project.id, assetId }
  }

  function storedFocalPoint(project: Awaited<ReturnType<typeof getProject>>, assetId: string) {
    return photoFocalPoint(project.submissions ?? [], assetId)
  }

  it("adjusts one photo without making the generated book stale", async () => {
    const { projectId, assetId } = await projectWithPhoto()
    await closeProject(projectId)
    await createLayout(projectId)
    await generateProjectBook(projectId, {
      mode: "cycle",
      seed: "crop",
      manualAssignments: {},
      resolutionOverrides: [],
    })

    // An untouched photo reports no crop centre at all, so the layout's own focal point decides.
    expect(storedFocalPoint(await getProject(projectId, true), assetId)).toBeUndefined()

    await setAssetFocalPoint({ projectId, assetId, focalPoint: { x: 0.5, y: 0.15 } })

    const adjusted = await getProject(projectId, true)
    expect(storedFocalPoint(adjusted, assetId)).toEqual({ x: 0.5, y: 0.15 })
    expect(adjusted.bookStatus).toBe("current")

    await setAssetFocalPoint({ projectId, assetId, focalPoint: null })

    const reset = await getProject(projectId, true)
    expect(storedFocalPoint(reset, assetId)).toBeUndefined()
    expect(reset.bookStatus).toBe("current")
  })

  it("refuses photos outside the project and edits to an archived project", async () => {
    const { projectId, assetId } = await projectWithPhoto()

    await expect(
      setAssetFocalPoint({ projectId, assetId: crypto.randomUUID(), focalPoint: { x: 0, y: 0 } })
    ).rejects.toMatchObject({ status: 404 })

    await archiveProject(projectId)
    await expect(
      setAssetFocalPoint({ projectId, assetId, focalPoint: { x: 0, y: 0 } })
    ).rejects.toMatchObject({ status: 409 })
  })
})

describe("draft autosave validation", () => {
  const blankPromptForm: FormSchema = {
    version: FORM_SCHEMA_VERSION,
    questions: [
      { id: "fresh", type: "single-line", prompt: "", required: false, validateUrl: false },
      {
        id: "fresh-radio",
        type: "radio",
        prompt: "",
        required: false,
        choices: [
          { id: "a", label: "" },
          { id: "b", label: "Option 2" },
        ],
      },
    ],
  }

  it("saves a question the organizer has only just added", async () => {
    const project = await createProject({ title: "Fresh question" })
    createdProjectIds.add(project.id)

    const saved = await updateProject({
      projectId: project.id,
      formSchema: blankPromptForm,
      expectedRevision: 0,
    })
    expect(saved.formSchema).toEqual(blankPromptForm)
    expect(saved.formRevision).toBe(1)
  })

  it("still rejects a structurally invalid draft and reports which field failed", async () => {
    const project = await createProject({ title: "Invalid draft" })
    createdProjectIds.add(project.id)

    const rejection = await updateProject({
      projectId: project.id,
      formSchema: {
        version: FORM_SCHEMA_VERSION,
        questions: [
          {
            id: "too-long",
            type: "multiline",
            prompt: "x".repeat(501),
            required: false,
          },
        ],
      },
      expectedRevision: 0,
    }).catch((error: unknown) => error)

    expect(rejection).toBeInstanceOf(HttpError)
    expect(rejection).toMatchObject({
      status: 422,
      details: {
        issues: [{ path: "questions.0.prompt", message: "Use no more than 500 characters." }],
      },
    })

    // The rejected save must not have advanced the revision.
    expect((await getProject(project.id)).formRevision).toBe(0)
  })

  it("refuses to publish the blank-prompt draft it happily saved", async () => {
    const project = await createProject({ title: "Blank prompt publish" })
    createdProjectIds.add(project.id)
    await updateProject({
      projectId: project.id,
      formSchema: blankPromptForm,
      expectedRevision: 0,
    })

    const rejection = await publishProject(project.id).catch((error: unknown) => error)
    expect(rejection).toBeInstanceOf(HttpError)
    expect(rejection).toMatchObject({ status: 422 })
    expect((rejection as HttpError).details).toMatchObject({
      issues: expect.arrayContaining([
        { path: "questions.0.prompt", message: "Enter a question prompt." },
        { path: "questions.1.choices.0.label", message: "Enter a choice label." },
      ]),
    })
    expect((await getProject(project.id)).state).toBe("draft")
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

describe("cover and standalone layouts", () => {
  async function closedProject(title: string) {
    const project = await createProject({ title })
    createdProjectIds.add(project.id)
    await updateProject({ projectId: project.id, formSchema: completeForm, expectedRevision: 0 })
    await publishProject(project.id)
    await createSubmissionRecord({
      projectId: project.id,
      idempotencyKey: crypto.randomUUID(),
      answers: { name: "Nora", memory: "A memory", role: ["friend"], traits: ["kind"] },
      pendingAssets: [],
    })
    await closeProject(project.id)
    return project
  }

  const settings = {
    mode: "cycle" as const,
    seed: "covers",
    manualAssignments: {},
    resolutionOverrides: [],
  }

  it("allows one cover per side and pins it first and last in the book", async () => {
    const project = await closedProject("Covers")
    const response = await createLayout(project.id, "Response", "blank", "submission")
    const front = await createLayout(project.id, "Front", "blank", "front-cover")
    const back = await createLayout(project.id, "Back", "blank", "back-cover")

    await expect(
      createLayout(project.id, "Another front", "blank", "front-cover")
    ).rejects.toBeInstanceOf(HttpError)

    const book = await generateProjectBook(project.id, settings)
    expect(book.pages.map((page) => page.layoutId)).toEqual([front.id, response.id, back.id])
    expect(book.pages.at(0)).toMatchObject({ kind: "standalone" })
    expect(book.pages.at(-1)).toMatchObject({ kind: "standalone" })
  })

  it("keeps covers in place when the reorderable layouts are rearranged", async () => {
    const project = await closedProject("Cover order")
    const front = await createLayout(project.id, "Front", "blank", "front-cover")
    const first = await createLayout(project.id, "First", "blank", "submission")
    const second = await createLayout(project.id, "Second", "blank", "submission")

    const reordered = await reorderLayouts(project.id, [second.id, first.id])

    expect(reordered.map((layout) => layout.id)).toEqual([front.id, second.id, first.id])
    await expect(
      reorderLayouts(project.id, [front.id, second.id, first.id])
    ).rejects.toBeInstanceOf(HttpError)
  })

  it("duplicates a cover into a standalone layout so the single-cover rule holds", async () => {
    const project = await closedProject("Cover copy")
    const front = await createLayout(project.id, "Front", "blank", "front-cover")

    const copy = await duplicateLayout(project.id, front.id)

    expect(copy.role).toBe("static")
    expect((await getProject(project.id)).layouts.map((layout) => layout.role)).toEqual([
      "front-cover",
      "static",
    ])
  })

  it("keeps the front cover first after another layout is deleted", async () => {
    const project = await closedProject("Cover after delete")
    const doomed = await createLayout(project.id, "Doomed", "blank", "submission")
    const front = await createLayout(project.id, "Front", "blank", "front-cover")
    const kept = await createLayout(project.id, "Kept", "blank", "submission")

    await deleteLayout(project.id, doomed.id)

    expect((await getProject(project.id)).layouts.map((layout) => layout.id)).toEqual([
      front.id,
      kept.id,
    ])
  })

  it("carries layout roles into a duplicated project", async () => {
    const project = await closedProject("Cover duplication")
    await createLayout(project.id, "Response", "blank", "submission")
    await createLayout(project.id, "Front", "blank", "front-cover")
    await createLayout(project.id, "Back", "blank", "back-cover")
    await createLayout(project.id, "Note", "blank", "static")

    const source = await getProject(project.id)
    const copy = await duplicateProject(project.id)
    createdProjectIds.add(copy.id)

    // Both are returned in stored position order, so the copy should match the source layout for
    // layout; presentation order is derived from the role separately.
    expect(copy.layouts.map((layout) => [layout.name, layout.role])).toEqual(
      source.layouts.map((layout) => [layout.name, layout.role])
    )
    expect(copy.layouts.map((layout) => layout.role)).toContain("front-cover")
    expect(copy.layouts.map((layout) => layout.role)).toContain("back-cover")
    expect(copy.layouts.map((layout) => layout.role)).toContain("static")
  })

  it("refuses page edits that put a page on a layout of the wrong role", async () => {
    const project = await closedProject("Page validation")
    const response = await createLayout(project.id, "Response", "blank", "submission")
    const front = await createLayout(project.id, "Front", "blank", "front-cover")
    const book = await generateProjectBook(project.id, settings)
    const responsePage = book.pages.find((page) => page.kind === "submission")!

    // A standalone page may not sit on a response layout: generation would drop it silently.
    await expect(
      updateProjectBook({
        projectId: project.id,
        pages: [
          ...book.pages,
          {
            id: "standalone:invalid",
            kind: "standalone" as const,
            layoutId: response.id,
            problems: [],
          },
        ],
      })
    ).rejects.toBeInstanceOf(HttpError)

    // Nor may a response page be pinned to a cover layout.
    await expect(
      updateProjectBook({
        projectId: project.id,
        pages: book.pages.map((page) =>
          page.id === responsePage.id ? { ...page, layoutId: front.id } : page
        ),
      })
    ).rejects.toBeInstanceOf(HttpError)

    // A duplicated cover page is rejected too.
    await expect(
      updateProjectBook({
        projectId: project.id,
        pages: [
          ...book.pages,
          {
            id: "standalone:second",
            kind: "standalone" as const,
            layoutId: front.id,
            problems: [],
          },
        ],
      })
    ).rejects.toBeInstanceOf(HttpError)

    expect((await getProject(project.id)).book!.pages).toEqual(book.pages)
  })

  it("still accepts reordering a stale book whose layout was deleted", async () => {
    const project = await closedProject("Stale reorder")
    const response = await createLayout(project.id, "Response", "blank", "submission")
    await createLayout(project.id, "Spare", "blank", "submission")
    const note = await createLayout(project.id, "Note", "blank", "static")
    const generated = await generateProjectBook(project.id, settings)
    const withNote = [
      ...generated.pages,
      { id: "standalone:note", kind: "standalone" as const, layoutId: note.id, problems: [] },
    ]
    await updateProjectBook({ projectId: project.id, pages: withNote })
    await deleteLayout(project.id, response.id)

    const stored = (await getProject(project.id)).book!
    const reordered = await updateProjectBook({
      projectId: project.id,
      pages: [...stored.pages].reverse(),
    })

    expect(reordered.pages).toHaveLength(stored.pages.length)
  })

  it("converts a book saved with text-only standalone pages into layout-backed pages", async () => {
    const project = await closedProject("Legacy pages")
    const response = await createLayout(project.id, "Response", "blank", "submission")
    const generated = await generateProjectBook(project.id, settings)
    const submissionPage = generated.pages[0]!
    await db
      .update(books)
      .set({
        generatedBook: {
          ...generated,
          pages: [
            {
              id: "standalone:legacy-cover",
              kind: "standalone",
              pageType: "cover",
              title: "A book of memories",
              body: "For Lea",
              background: "#f4ede1",
              problems: [],
            },
            submissionPage,
          ],
        } as never,
      })
      .where(eq(books.projectId, project.id))

    const converted = await getProject(project.id)
    const coverLayout = converted.layouts.find((layout) => layout.role === "front-cover")

    expect(coverLayout).toBeDefined()
    expect(coverLayout!.schema.background).toBe("#f4ede1")
    expect(converted.layouts.map((layout) => layout.id)).toContain(response.id)
    expect(converted.book!.pages[0]).toEqual({
      id: "standalone:legacy-cover",
      kind: "standalone",
      layoutId: coverLayout!.id,
      problems: [],
    })

    // Idempotent: a second load neither re-converts nor adds another layout.
    const reloaded = await getProject(project.id)
    expect(reloaded.layouts).toHaveLength(converted.layouts.length)
    expect(reloaded.book!.pages).toEqual(converted.book!.pages)
  })
})

function exportReport(projectId: string): ExportReport {
  return {
    version: 1,
    projectId,
    sourceFingerprint: "reserved-export",
    generatedAt: "2026-08-30T00:00:00.000Z",
    specification: {
      standard: "DIN/ISO A5",
      trimMm: [210, 148],
      bleedMm: 3,
      mediaBoxMm: [216, 154],
      safeMarginMm: 6,
      targetPpi: 300,
      blockingPpi: 150,
      printCondition: "PSO Coated v3 / FOGRA51",
      marks: false,
    },
    checks: [],
    overrides: [],
    pdfx: { target: "PDF/X-4", structurallyVerified: true, limitation: null },
  }
}

async function reservedKeys(keys: string[]): Promise<string[]> {
  const rows = await db
    .select({ objectKey: assetTombstones.objectKey })
    .from(assetTombstones)
    .where(inArray(assetTombstones.objectKey, keys))
  return rows.map((row) => row.objectKey).sort()
}

describe("export object reservations", () => {
  it("hands reserved keys over to the export row that takes ownership", async () => {
    const project = await createProject({ title: "Reserved export" })
    createdProjectIds.add(project.id)
    const base = `projects/${project.id}/exports/${crypto.randomUUID()}`
    const keys = [`${base}/book.pdf`, `${base}/report.txt`, `${base}/pages.zip`]

    await reserveObjects(keys)
    expect(await reservedKeys(keys)).toEqual([...keys].sort())

    await recordExport({
      projectId: project.id,
      sourceFingerprint: "reserved-export",
      pdfObjectKey: keys[0]!,
      reportObjectKey: keys[1]!,
      pagePdfZipObjectKey: keys[2]!,
      pageJpegZipObjectKey: null,
      report: exportReport(project.id),
    })

    expect(await reservedKeys(keys)).toEqual([])
  })

  it("keeps a reservation when the export row cannot be written", async () => {
    const base = `projects/${crypto.randomUUID()}/exports/${crypto.randomUUID()}`
    const keys = [`${base}/book.pdf`, `${base}/report.txt`]

    await reserveObjects(keys)
    // An unknown project fails the foreign key, so the handover must not happen either.
    await expect(
      recordExport({
        projectId: "99999999-9999-4999-8999-999999999999",
        sourceFingerprint: "orphan-export",
        pdfObjectKey: keys[0]!,
        reportObjectKey: keys[1]!,
        pagePdfZipObjectKey: null,
        pageJpegZipObjectKey: null,
        report: exportReport("99999999-9999-4999-8999-999999999999"),
      })
    ).rejects.toThrow()

    expect(await reservedKeys(keys)).toEqual([...keys].sort())
    await db.delete(assetTombstones).where(inArray(assetTombstones.objectKey, keys))
  })

  it("sweeps a reservation only once it has had time to be claimed", async () => {
    const base = `projects/${crypto.randomUUID()}/exports/${crypto.randomUUID()}`
    const keys = [`${base}/pages.zip`]

    await reserveObjects(keys)
    await cleanupOrphanedObjects()
    // A write that is still uploading must survive a sweep that runs beside it.
    expect(await reservedKeys(keys)).toEqual(keys)

    await db
      .update(assetTombstones)
      .set({ createdAt: sql`now() - interval '2 hours'` })
      .where(inArray(assetTombstones.objectKey, keys))
    await cleanupOrphanedObjects()

    expect(await reservedKeys(keys)).toEqual([])
  })
})
