import { afterEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { db } from "./db"
import { projects, projectInvitations } from "./db/schema"
import {
  createProject,
  generateProjectBook,
  createLayout,
  closeProject,
  createDecorativeAssetRecord,
  updateLayout,
  getAsset,
  deleteProject,
  listProjects,
  duplicateProject,
  publishProject,
  updateProject,
} from "./repository"
import {
  acceptInvitation,
  changeCollaborator,
  getProjectAccess,
  inviteCollaborator,
  projectRole,
  requireProjectRole,
  revokeInvitation,
  transferOwnership,
} from "./project-access"
import { getObject, putObject } from "./object-store"
import { renderBookPdf } from "./pdf-renderer"
import { completeForm, cycleSettings } from "../test/fixtures"

const ids: string[] = []
afterEach(async () => {
  for (const id of ids.splice(0)) await deleteProject(id)
})
async function makeProject(ownerUserId = "owner") {
  const project = await createProject({ title: "Private book", ownerUserId })
  ids.push(project.id)
  return project
}
async function invitation(
  projectId: string,
  email = "editor@example.com",
  role: "editor" | "organizer" = "editor"
) {
  let token = ""
  const result = await inviteCollaborator(
    projectId,
    "owner",
    email,
    role,
    async (_, deliveredToken) => {
      token = deliveredToken
    }
  )
  return { ...result, token }
}

describe("private project membership", () => {
  it("isolates lists, assigns one owner, and keeps legacy projects inaccessible", async () => {
    const project = await makeProject()
    expect(await projectRole(project.id, "owner")).toBe("owner")
    expect((await listProjects("owner")).map((p) => p.id)).toContain(project.id)
    expect((await listProjects("stranger")).map((p) => p.id)).not.toContain(project.id)
    await expect(projectRole(project.id, "stranger")).rejects.toMatchObject({ status: 404 })
    await db.update(projects).set({ ownerUserId: null }).where(eq(projects.id, project.id))
    await expect(projectRole(project.id, "owner")).rejects.toMatchObject({ status: 404 })
  })

  it("accepts verified invitations, enforces roles, transfers ownership, and revokes access", async () => {
    const project = await makeProject()
    const editorInvite = await invitation(project.id)
    await expect(acceptInvitation(editorInvite.token, "editor", [])).rejects.toMatchObject({
      status: 403,
    })
    await expect(
      acceptInvitation(editorInvite.token, "stranger", ["wrong@example.com"])
    ).rejects.toMatchObject({ status: 403 })
    expect(await acceptInvitation(editorInvite.token, "editor", ["EDITOR@example.com"])).toEqual({
      projectId: project.id,
    })
    expect(await acceptInvitation(editorInvite.token, "editor", ["editor@example.com"])).toEqual({
      projectId: project.id,
    })
    expect((await listProjects("editor")).map((p) => p.id)).toContain(project.id)
    expect(await requireProjectRole(project.id, "editor", "edit")).toBe("editor")
    await expect(requireProjectRole(project.id, "editor", "manage")).rejects.toMatchObject({
      status: 403,
    })
    await expect(
      inviteCollaborator(project.id, "editor", "other@example.com", "organizer", async () => {})
    ).rejects.toMatchObject({ status: 403 })
    expect((await getProjectAccess(project.id, "editor")).members).toEqual([])
    await changeCollaborator(project.id, "owner", "editor", "organizer")
    await expect(requireProjectRole(project.id, "editor", "owner")).rejects.toMatchObject({
      status: 403,
    })
    await expect(
      transferOwnership(project.id, "editor", "owner", "editor@example.com")
    ).rejects.toMatchObject({ status: 403 })
    await expect(changeCollaborator(project.id, "editor", "owner", null)).rejects.toMatchObject({
      status: 403,
    })
    await transferOwnership(project.id, "owner", "editor", "owner@example.com")
    expect(await projectRole(project.id, "editor")).toBe("owner")
    expect(await projectRole(project.id, "owner")).toBe("organizer")
    await expect(requireProjectRole(project.id, "owner", "owner")).rejects.toMatchObject({
      status: 403,
    })
    await transferOwnership(project.id, "editor", "owner", "editor@example.com")
    await changeCollaborator(project.id, "owner", "editor", null)
    await expect(projectRole(project.id, "editor")).rejects.toMatchObject({ status: 404 })
    await expect(
      acceptInvitation(editorInvite.token, "editor", ["editor@example.com"])
    ).rejects.toMatchObject({ status: 410 })
    expect((await listProjects("editor")).map((p) => p.id)).not.toContain(project.id)
  })

  it("rejects expired, revoked, superseded, and failed-delivery invitations", async () => {
    const project = await makeProject()
    const first = await invitation(project.id)
    const second = await invitation(project.id)
    await expect(
      acceptInvitation(first.token, "editor", ["editor@example.com"])
    ).rejects.toMatchObject({ status: 410 })
    await revokeInvitation(project.id, "owner", second.id)
    await expect(
      acceptInvitation(second.token, "editor", ["editor@example.com"])
    ).rejects.toMatchObject({ status: 410 })
    const expired = await invitation(project.id)
    await db
      .update(projectInvitations)
      .set({ expiresAt: new Date(0) })
      .where(eq(projectInvitations.id, expired.id))
    await expect(
      acceptInvitation(expired.token, "editor", ["editor@example.com"])
    ).rejects.toMatchObject({ status: 410 })
    let failedToken = ""
    await expect(
      inviteCollaborator(project.id, "owner", "editor@example.com", "editor", async (_, token) => {
        failedToken = token
        throw new Error("mail down")
      })
    ).rejects.toMatchObject({ status: 502 })
    await expect(
      acceptInvitation(failedToken, "editor", ["editor@example.com"])
    ).rejects.toMatchObject({ status: 410 })
    const retry = await invitation(project.id)
    await acceptInvitation(retry.token, "editor", ["editor@example.com"])
    const newRole = await invitation(project.id, "editor@example.com", "organizer")
    await acceptInvitation(newRole.token, "editor", ["editor@example.com"])
    expect(await projectRole(project.id, "editor")).toBe("editor")
  })

  it("serializes simultaneous ownership transfers", async () => {
    const project = await makeProject()
    for (const user of ["a", "b"]) {
      const invite = await invitation(project.id, `${user}@example.com`)
      await acceptInvitation(invite.token, user, [`${user}@example.com`])
    }
    const results = await Promise.allSettled([
      transferOwnership(project.id, "owner", "a", "owner@example.com"),
      transferOwnership(project.id, "owner", "b", "owner@example.com"),
    ])
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    const roles = await Promise.all(
      ["owner", "a", "b"].map((user) => projectRole(project.id, user))
    )
    expect(roles.filter((role) => role === "owner")).toHaveLength(1)
  })

  it("rejects foreign image references and gives copies their own image files", async () => {
    const project = await makeProject()
    const other = await makeProject("other")
    for (const book of [project, other]) {
      await updateProject({ projectId: book.id, formSchema: completeForm, expectedRevision: 0 })
      await publishProject(book.id)
      await closeProject(book.id)
    }
    const assetId = crypto.randomUUID()
    const objectKey = `tests/${assetId}/master`
    const previewObjectKey = `tests/${assetId}/preview`
    const image = new Uint8Array([1, 2, 3])
    for (const key of [objectKey, previewObjectKey])
      await putObject({ key, body: image, contentType: "image/png" })
    await createDecorativeAssetRecord({
      id: assetId,
      projectId: project.id,
      objectKey,
      previewObjectKey,
      masterMimeType: "image/png",
      sourceMimeType: "image/png",
      sourceName: "test.png",
      sizeBytes: 3,
      width: 1,
      height: 1,
    })
    const ownLayout = await createLayout(project.id)
    const foreignLayout = await createLayout(other.id)
    const schema = {
      ...ownLayout.schema,
      elements: [
        {
          id: "image",
          type: "decorative-image" as const,
          assetId,
          opacity: 1,
          geometry: { x: 10, y: 10, width: 20, height: 20, rotation: 0 },
          focalPoint: { x: 0.5, y: 0.5 },
        },
      ],
    }
    await expect(
      updateLayout({ projectId: other.id, layoutId: foreignLayout.id, expectedRevision: 0, schema })
    ).rejects.toMatchObject({ status: 422 })
    await expect(getAsset(assetId, other.id)).rejects.toMatchObject({ status: 404 })
    const book = await generateProjectBook(other.id, cycleSettings)
    await expect(
      renderBookPdf({
        book: {
          ...book,
          pages: [
            { id: "foreign-image", kind: "standalone", layoutId: foreignLayout.id, problems: [] },
          ],
        },
        layouts: [{ ...foreignLayout, schema }],
        submissions: [],
        form: completeForm,
        marks: false,
      })
    ).rejects.toMatchObject({ status: 404 })
    await updateLayout({
      projectId: project.id,
      layoutId: ownLayout.id,
      expectedRevision: 0,
      schema,
    })
    const copy = await duplicateProject(project.id, "copy-owner")
    ids.push(copy.id)
    const element = copy.layouts[0]!.schema.elements[0]!
    expect(element.type).toBe("decorative-image")
    if (element.type !== "decorative-image") throw new Error("Expected copied image")
    expect(element.assetId).not.toBe(assetId)
    const copiedAsset = await getAsset(element.assetId!, copy.id)
    expect(copiedAsset.objectKey).not.toBe(objectKey)
    await deleteProject(project.id)
    ids.splice(ids.indexOf(project.id), 1)
    expect((await getObject(copiedAsset.objectKey)).body).toEqual(image)
  })

  it("makes a duplicate private to its creator", async () => {
    const project = await makeProject()
    await updateProject({ projectId: project.id, formSchema: completeForm, expectedRevision: 0 })
    await publishProject(project.id)
    const copy = await duplicateProject(project.id, "copy-owner")
    ids.push(copy.id)
    expect(await projectRole(copy.id, "copy-owner")).toBe("owner")
    await expect(projectRole(copy.id, "owner")).rejects.toMatchObject({ status: 404 })
  })
})
