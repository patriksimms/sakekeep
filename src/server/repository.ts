import { and, asc, count, desc, eq, inArray, max, sql } from "drizzle-orm"

import { emptyFormSchema, validateFormForPublish } from "../domain/form"
import { generateBook } from "../domain/generation"
import { emptyLayoutSchema, layoutSchemaValidator } from "../domain/layout"
import {
  type BookPage,
  type FormSchema,
  type GeneratedBook,
  type GenerationSettings,
  type ImageAnswer,
  type LayoutRecord,
  type LayoutSchema,
  type Project,
  type ProjectSummary,
  type SubmissionAnswers,
  type SubmissionSummary,
} from "../domain/types"
import { db } from "./db"
import {
  assetTombstones,
  assets,
  books,
  exportsTable,
  layouts,
  projects,
  submissions,
} from "./db/schema"
import { env } from "./env"
import { HttpError } from "./http"
import { deleteObjects } from "./object-store"
import { shareTokenForProject, shareTokenHash } from "./share-token"

function iso(value: Date): string {
  return value.toISOString()
}

function layoutRecord(row: typeof layouts.$inferSelect): LayoutRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    position: row.position,
    revision: row.revision,
    schema: row.schema,
    updatedAt: iso(row.updatedAt),
  }
}

function submissionSummary(row: typeof submissions.$inferSelect): SubmissionSummary {
  return {
    id: row.id,
    sequence: row.sequence,
    submittedAt: iso(row.submittedAt),
    answers: row.answers,
  }
}

function shareUrl(projectId: string, state: string): string | null {
  if (state === "draft") return null
  return `${env().APP_ORIGIN}/s/${shareTokenForProject(projectId)}`
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const rows = await db
    .select({
      project: projects,
      submissionCount: count(submissions.id),
    })
    .from(projects)
    .leftJoin(submissions, eq(submissions.projectId, projects.id))
    .groupBy(projects.id)
    .orderBy(desc(projects.updatedAt))

  return rows.map(({ project, submissionCount }) => ({
    id: project.id,
    title: project.title,
    occasion: project.occasion,
    state: project.state,
    submissionCount,
    bookStatus: project.bookStatus,
    createdAt: iso(project.createdAt),
    updatedAt: iso(project.updatedAt),
  }))
}

export async function getProject(projectId: string, includeSubmissions = false): Promise<Project> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!project) throw new HttpError(404, "Project not found.")

  const [layoutRows, bookRows, submissionRows, countRows] = await Promise.all([
    db
      .select()
      .from(layouts)
      .where(eq(layouts.projectId, projectId))
      .orderBy(asc(layouts.position)),
    db.select().from(books).where(eq(books.projectId, projectId)).limit(1),
    includeSubmissions
      ? db
          .select()
          .from(submissions)
          .where(eq(submissions.projectId, projectId))
          .orderBy(asc(submissions.sequence))
      : Promise.resolve([]),
    db.select({ value: count() }).from(submissions).where(eq(submissions.projectId, projectId)),
  ])

  return {
    id: project.id,
    title: project.title,
    occasion: project.occasion,
    state: project.state,
    formSchema: project.formSchema,
    formRevision: project.formRevision,
    shareUrl: shareUrl(project.id, project.state),
    submissionCount: countRows[0]?.value ?? 0,
    bookStatus: project.bookStatus,
    layouts: layoutRows.map(layoutRecord),
    book: bookRows[0]?.generatedBook ?? null,
    submissions: includeSubmissions ? submissionRows.map(submissionSummary) : undefined,
    createdAt: iso(project.createdAt),
    updatedAt: iso(project.updatedAt),
  }
}

export async function createProject(input: {
  title: string
  occasion?: string | null
}): Promise<Project> {
  const title = input.title.trim()
  if (!title || title.length > 200) {
    throw new HttpError(400, "Project title must be between 1 and 200 characters.")
  }
  const id = crypto.randomUUID()
  await db.insert(projects).values({
    id,
    title,
    occasion: input.occasion?.trim() || null,
    formSchema: emptyFormSchema(),
  })
  return getProject(id)
}

export async function updateProject(input: {
  projectId: string
  title?: string
  occasion?: string | null
  formSchema?: FormSchema
  expectedRevision?: number
}): Promise<Project> {
  const [existing] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .limit(1)
  if (!existing) throw new HttpError(404, "Project not found.")

  if (input.formSchema) {
    if (existing.state !== "draft") {
      throw new HttpError(409, "Published forms are permanently frozen.")
    }
    if (input.expectedRevision === undefined) {
      throw new HttpError(400, "Form autosave requires an expected revision.")
    }
    const parsed = validateFormForPublish({
      ...input.formSchema,
      questions: input.formSchema.questions,
    })
    const structuralIssues = parsed.filter(
      (issue) => issue.message !== "Add at least one valid question before publishing."
    )
    if (structuralIssues.length > 0) {
      throw new HttpError(422, "The form contains invalid configuration.", {
        issues: structuralIssues,
      })
    }
  }

  const title = input.title?.trim()
  if (title !== undefined && (!title || title.length > 200)) {
    throw new HttpError(400, "Project title must be between 1 and 200 characters.")
  }

  const condition =
    input.formSchema && input.expectedRevision !== undefined
      ? and(
          eq(projects.id, input.projectId),
          eq(projects.formRevision, input.expectedRevision),
          eq(projects.state, "draft")
        )
      : eq(projects.id, input.projectId)
  const updated = await db
    .update(projects)
    .set({
      ...(title !== undefined ? { title } : {}),
      ...(input.occasion !== undefined ? { occasion: input.occasion?.trim() || null } : {}),
      ...(input.formSchema
        ? {
            formSchema: input.formSchema,
            formRevision: sql`${projects.formRevision} + 1`,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(condition)
    .returning({ id: projects.id })
  if (updated.length === 0) {
    throw new HttpError(409, "A newer form revision was saved first. Reload before continuing.")
  }
  return getProject(input.projectId)
}

export async function publishProject(projectId: string): Promise<Project> {
  await db.transaction(async (tx) => {
    const [project] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("update")
    if (!project) throw new HttpError(404, "Project not found.")
    if (project.state !== "draft") {
      throw new HttpError(409, "This project has already been published.")
    }
    const issues = validateFormForPublish(project.formSchema)
    if (issues.length > 0) {
      throw new HttpError(422, "Resolve all form issues before publishing.", {
        issues,
      })
    }
    const token = shareTokenForProject(projectId)
    await tx
      .update(projects)
      .set({
        state: "collecting",
        shareTokenHash: shareTokenHash(token),
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, projectId), eq(projects.state, "draft")))
  })
  return getProject(projectId)
}

export async function closeProject(projectId: string): Promise<Project> {
  await db.transaction(async (tx) => {
    const [project] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("update")
    if (!project) throw new HttpError(404, "Project not found.")
    if (project.state === "closed") {
      throw new HttpError(409, "Collection is already permanently closed.")
    }
    if (project.state !== "collecting") {
      throw new HttpError(409, "Publish the form before closing collection.")
    }
    await tx
      .update(projects)
      .set({ state: "closed", updatedAt: new Date() })
      .where(and(eq(projects.id, projectId), eq(projects.state, "collecting")))
  })
  return getProject(projectId, true)
}

export async function duplicateProject(projectId: string): Promise<Project> {
  const newId = crypto.randomUUID()
  await db.transaction(async (tx) => {
    const [source] = await tx.select().from(projects).where(eq(projects.id, projectId)).for("share")
    if (!source) throw new HttpError(404, "Project not found.")
    if (source.state === "draft") {
      throw new HttpError(409, "Only published or closed projects can be duplicated.")
    }
    await tx.insert(projects).values({
      id: newId,
      title: `${source.title} — copy`,
      occasion: source.occasion,
      formSchema: source.formSchema,
    })
    const sourceLayouts = await tx
      .select()
      .from(layouts)
      .where(eq(layouts.projectId, projectId))
      .orderBy(asc(layouts.position))
    if (sourceLayouts.length > 0) {
      await tx.insert(layouts).values(
        sourceLayouts.map((layout) => ({
          id: crypto.randomUUID(),
          projectId: newId,
          name: layout.name,
          position: layout.position,
          schema: layout.schema,
        }))
      )
    }
  })
  return getProject(newId)
}

export async function deleteProject(projectId: string): Promise<void> {
  const keys = await db.transaction(async (tx) => {
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("update")
    if (!project) throw new HttpError(404, "Project not found.")
    const assetRows = await tx
      .select({
        objectKey: assets.objectKey,
        previewObjectKey: assets.previewObjectKey,
      })
      .from(assets)
      .where(eq(assets.projectId, projectId))
    const exportRows = await tx
      .select({
        pdfObjectKey: exportsTable.pdfObjectKey,
        reportObjectKey: exportsTable.reportObjectKey,
      })
      .from(exportsTable)
      .where(eq(exportsTable.projectId, projectId))
    const objectKeys = [
      ...assetRows.flatMap((row) => [row.objectKey, row.previewObjectKey]),
      ...exportRows.flatMap((row) => [row.pdfObjectKey, row.reportObjectKey]),
    ]
    if (objectKeys.length > 0) {
      await tx
        .insert(assetTombstones)
        .values(objectKeys.map((objectKey) => ({ objectKey })))
        .onConflictDoNothing()
    }
    await tx.delete(projects).where(eq(projects.id, projectId))
    return objectKeys
  })

  const failed = await deleteObjects(keys)
  const succeeded = keys.filter((key) => !failed.includes(key))
  if (succeeded.length > 0) {
    await db.delete(assetTombstones).where(inArray(assetTombstones.objectKey, succeeded))
  }
}

export async function cleanupOrphanedObjects(): Promise<{
  removed: number
  remaining: number
}> {
  const rows = await db.select().from(assetTombstones)
  const keys = rows.map((row) => row.objectKey)
  const failed = await deleteObjects(keys)
  const succeeded = keys.filter((key) => !failed.includes(key))
  if (succeeded.length > 0) {
    await db.delete(assetTombstones).where(inArray(assetTombstones.objectKey, succeeded))
  }
  return { removed: succeeded.length, remaining: failed.length }
}

function markBookStaleSet(status: "not-generated" | "current" | "stale") {
  return status === "not-generated" ? "not-generated" : ("stale" as const)
}

export async function createLayout(
  projectId: string,
  name = "Untitled layout"
): Promise<LayoutRecord> {
  const record = await db.transaction(async (tx) => {
    const [project] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("update")
    if (!project) throw new HttpError(404, "Project not found.")
    if (project.state !== "closed") {
      throw new HttpError(409, "Close collection before authoring layouts.")
    }
    const [positionRow] = await tx
      .select({ value: max(layouts.position) })
      .from(layouts)
      .where(eq(layouts.projectId, projectId))
    const [created] = await tx
      .insert(layouts)
      .values({
        id: crypto.randomUUID(),
        projectId,
        name: name.trim() || "Untitled layout",
        position: (positionRow?.value ?? -1) + 1,
        schema: emptyLayoutSchema(),
      })
      .returning()
    await tx
      .update(projects)
      .set({
        bookStatus: markBookStaleSet(project.bookStatus),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
    return created!
  })
  return layoutRecord(record)
}

export async function updateLayout(input: {
  projectId: string
  layoutId: string
  expectedRevision: number
  name?: string
  schema?: LayoutSchema
}): Promise<LayoutRecord> {
  if (input.schema) {
    const parsed = layoutSchemaValidator.safeParse(input.schema)
    if (!parsed.success) {
      throw new HttpError(422, "The canonical layout schema is invalid.", {
        issues: parsed.error.issues,
      })
    }
  }
  const result = await db.transaction(async (tx) => {
    const [project] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .for("update")
    if (!project) throw new HttpError(404, "Project not found.")
    const [updated] = await tx
      .update(layouts)
      .set({
        ...(input.name !== undefined ? { name: input.name.trim() || "Untitled layout" } : {}),
        ...(input.schema ? { schema: input.schema } : {}),
        revision: sql`${layouts.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(layouts.id, input.layoutId),
          eq(layouts.projectId, input.projectId),
          eq(layouts.revision, input.expectedRevision)
        )
      )
      .returning()
    if (!updated) {
      throw new HttpError(409, "A newer layout revision was saved first. Reload before continuing.")
    }
    await tx
      .update(projects)
      .set({
        bookStatus: markBookStaleSet(project.bookStatus),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, input.projectId))
    return updated
  })
  return layoutRecord(result)
}

export async function duplicateLayout(projectId: string, layoutId: string): Promise<LayoutRecord> {
  const result = await db.transaction(async (tx) => {
    const [project] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("update")
    if (!project) throw new HttpError(404, "Project not found.")
    const [source] = await tx
      .select()
      .from(layouts)
      .where(and(eq(layouts.id, layoutId), eq(layouts.projectId, projectId)))
    if (!source) throw new HttpError(404, "Layout not found.")
    const [positionRow] = await tx
      .select({ value: max(layouts.position) })
      .from(layouts)
      .where(eq(layouts.projectId, projectId))
    const [created] = await tx
      .insert(layouts)
      .values({
        id: crypto.randomUUID(),
        projectId,
        name: `${source.name} — copy`,
        position: (positionRow?.value ?? -1) + 1,
        schema: source.schema,
      })
      .returning()
    await tx
      .update(projects)
      .set({
        bookStatus: markBookStaleSet(project.bookStatus),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
    return created!
  })
  return layoutRecord(result)
}

export async function reorderLayouts(
  projectId: string,
  layoutIds: string[]
): Promise<LayoutRecord[]> {
  await db.transaction(async (tx) => {
    const current = await tx
      .select()
      .from(layouts)
      .where(eq(layouts.projectId, projectId))
      .orderBy(asc(layouts.position))
    if (
      current.length !== layoutIds.length ||
      new Set(layoutIds).size !== layoutIds.length ||
      current.some((layout) => !layoutIds.includes(layout.id))
    ) {
      throw new HttpError(422, "Layout order must contain every layout once.")
    }
    for (const [index, layoutId] of layoutIds.entries()) {
      await tx
        .update(layouts)
        .set({ position: -(index + 1), updatedAt: new Date() })
        .where(and(eq(layouts.id, layoutId), eq(layouts.projectId, projectId)))
    }
    for (const [index, layoutId] of layoutIds.entries()) {
      await tx
        .update(layouts)
        .set({ position: index, updatedAt: new Date() })
        .where(and(eq(layouts.id, layoutId), eq(layouts.projectId, projectId)))
    }
    await tx
      .update(projects)
      .set({
        bookStatus: sql`case when ${projects.bookStatus} = 'not-generated' then 'not-generated' else 'stale' end`,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
  })
  const rows = await db
    .select()
    .from(layouts)
    .where(eq(layouts.projectId, projectId))
    .orderBy(asc(layouts.position))
  return rows.map(layoutRecord)
}

export async function deleteLayout(projectId: string, layoutId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [project] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("update")
    const [book] = await tx.select().from(books).where(eq(books.projectId, projectId))
    if (!project) throw new HttpError(404, "Project not found.")
    if (
      book?.generatedBook.pages.some(
        (page) => page.kind === "submission" && page.layoutId === layoutId
      )
    ) {
      throw new HttpError(
        409,
        "This layout is assigned to generated pages. Reassign and regenerate before deleting it."
      )
    }
    const deleted = await tx
      .delete(layouts)
      .where(and(eq(layouts.id, layoutId), eq(layouts.projectId, projectId)))
      .returning({ id: layouts.id })
    if (deleted.length === 0) throw new HttpError(404, "Layout not found.")
    const remaining = await tx
      .select()
      .from(layouts)
      .where(eq(layouts.projectId, projectId))
      .orderBy(asc(layouts.position))
    for (const [position, layout] of remaining.entries()) {
      await tx.update(layouts).set({ position }).where(eq(layouts.id, layout.id))
    }
    await tx
      .update(projects)
      .set({
        bookStatus: markBookStaleSet(project.bookStatus),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
  })
}

export async function generateProjectBook(
  projectId: string,
  settings: GenerationSettings
): Promise<GeneratedBook> {
  return db.transaction(async (tx) => {
    const [project] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("update")
    if (!project) throw new HttpError(404, "Project not found.")
    if (project.state !== "closed") {
      throw new HttpError(409, "Close collection before generating a book.")
    }
    const layoutRows = await tx
      .select()
      .from(layouts)
      .where(eq(layouts.projectId, projectId))
      .orderBy(asc(layouts.position))
    const submissionRows = await tx
      .select()
      .from(submissions)
      .where(eq(submissions.projectId, projectId))
      .orderBy(asc(submissions.sequence))
    const previousRows = await tx.select().from(books).where(eq(books.projectId, projectId))
    const book = generateBook({
      projectId,
      form: project.formSchema,
      submissions: submissionRows.map(submissionSummary),
      layouts: layoutRows.map(layoutRecord),
      settings,
      previousBook: previousRows[0]?.generatedBook,
    })
    await tx
      .insert(books)
      .values({
        projectId,
        settings,
        generatedBook: book,
        sourceFingerprint: book.sourceFingerprint,
        generatedAt: new Date(book.generatedAt),
      })
      .onConflictDoUpdate({
        target: books.projectId,
        set: {
          settings,
          generatedBook: book,
          sourceFingerprint: book.sourceFingerprint,
          generatedAt: new Date(book.generatedAt),
          updatedAt: new Date(),
        },
      })
    await tx
      .update(projects)
      .set({ bookStatus: "current", updatedAt: new Date() })
      .where(eq(projects.id, projectId))
    return book
  })
}

export async function updateProjectBook(input: {
  projectId: string
  pages?: BookPage[]
  settings?: GenerationSettings
}): Promise<GeneratedBook> {
  return db.transaction(async (tx) => {
    const [book] = await tx
      .select()
      .from(books)
      .where(eq(books.projectId, input.projectId))
      .for("update")
    if (!book) throw new HttpError(409, "Generate the book first.")
    const updated: GeneratedBook = {
      ...book.generatedBook,
      ...(input.pages ? { pages: input.pages } : {}),
      ...(input.settings ? { settings: input.settings } : {}),
      updatedAt: new Date().toISOString(),
    }
    await tx
      .update(books)
      .set({
        settings: updated.settings,
        generatedBook: updated,
        updatedAt: new Date(),
      })
      .where(eq(books.projectId, input.projectId))
    await tx
      .update(projects)
      .set({ bookStatus: "stale", updatedAt: new Date() })
      .where(eq(projects.id, input.projectId))
    return updated
  })
}

export interface PendingAsset {
  id: string
  questionId: string
  objectKey: string
  previewObjectKey: string
  masterMimeType: string
  sourceMimeType: string
  sourceName: string
  sizeBytes: number
  width: number
  height: number
}

export async function findPublicProject(token: string): Promise<
  | { status: "unknown" }
  | { status: "closed" }
  | {
      status: "collecting"
      projectId: string
      title: string
      formSchema: FormSchema
    }
> {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.shareTokenHash, shareTokenHash(token)))
    .limit(1)
  if (!project) return { status: "unknown" }
  if (project.state !== "collecting") return { status: "closed" }
  return {
    status: "collecting",
    projectId: project.id,
    title: project.title,
    formSchema: project.formSchema,
  }
}

export async function findSubmissionByIdempotency(
  projectId: string,
  idempotencyKey: string
): Promise<SubmissionSummary | null> {
  const [row] = await db
    .select()
    .from(submissions)
    .where(
      and(eq(submissions.projectId, projectId), eq(submissions.idempotencyKey, idempotencyKey))
    )
    .limit(1)
  return row ? submissionSummary(row) : null
}

export async function createSubmissionRecord(input: {
  projectId: string
  idempotencyKey: string
  answers: SubmissionAnswers
  pendingAssets: PendingAsset[]
}): Promise<{ submission: SubmissionSummary; created: boolean }> {
  return db.transaction(async (tx) => {
    const [project] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .for("update")
    if (!project || project.state !== "collecting") {
      throw new HttpError(409, "Collection is closed. This response was not saved.")
    }
    const [existing] = await tx
      .select()
      .from(submissions)
      .where(
        and(
          eq(submissions.projectId, input.projectId),
          eq(submissions.idempotencyKey, input.idempotencyKey)
        )
      )
    if (existing) return { submission: submissionSummary(existing), created: false }

    const [sequenceRow] = await tx
      .select({ value: max(submissions.sequence) })
      .from(submissions)
      .where(eq(submissions.projectId, input.projectId))
    const submissionId = crypto.randomUUID()
    const imageAnswers = Object.fromEntries(
      project.formSchema.questions
        .filter((question) => question.type === "images")
        .map((question) => {
          const values: ImageAnswer[] = input.pendingAssets
            .filter((asset) => asset.questionId === question.id)
            .map((asset) => ({
              assetId: asset.id,
              name: asset.sourceName,
              mimeType: asset.masterMimeType,
              width: asset.width,
              height: asset.height,
              sizeBytes: asset.sizeBytes,
              previewUrl: `/api/assets/${asset.id}?variant=preview`,
              masterUrl: `/api/assets/${asset.id}?variant=master`,
              focalPoint: { x: 0.5, y: 0.5 },
            }))
          return [question.id, values]
        })
    )
    const persistedAnswers: SubmissionAnswers = {
      ...input.answers,
      ...imageAnswers,
    }
    const [created] = await tx
      .insert(submissions)
      .values({
        id: submissionId,
        projectId: input.projectId,
        idempotencyKey: input.idempotencyKey,
        sequence: (sequenceRow?.value ?? 0) + 1,
        answers: persistedAnswers,
      })
      .returning()
    if (input.pendingAssets.length > 0) {
      await tx.insert(assets).values(
        input.pendingAssets.map((asset) => ({
          id: asset.id,
          projectId: input.projectId,
          submissionId,
          questionId: asset.questionId,
          kind: "submission-image" as const,
          objectKey: asset.objectKey,
          previewObjectKey: asset.previewObjectKey,
          mimeType: asset.masterMimeType,
          sourceMimeType: asset.sourceMimeType,
          sourceName: asset.sourceName,
          sizeBytes: asset.sizeBytes,
          width: asset.width,
          height: asset.height,
        }))
      )
    }
    return { submission: submissionSummary(created!), created: true }
  })
}

export async function getAsset(assetId: string): Promise<typeof assets.$inferSelect> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1)
  if (!asset) throw new HttpError(404, "Asset not found.")
  return asset
}

export async function createDecorativeAssetRecord(input: {
  id: string
  projectId: string
  objectKey: string
  previewObjectKey: string
  masterMimeType: string
  sourceMimeType: string
  sourceName: string
  sizeBytes: number
  width: number
  height: number
}): Promise<typeof assets.$inferSelect> {
  const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId))
  if (!project) throw new HttpError(404, "Project not found.")
  if (project.state !== "closed") {
    throw new HttpError(409, "Close collection before authoring layouts.")
  }
  const [asset] = await db
    .insert(assets)
    .values({
      id: input.id,
      projectId: input.projectId,
      submissionId: null,
      questionId: null,
      kind: "decorative-image",
      objectKey: input.objectKey,
      previewObjectKey: input.previewObjectKey,
      mimeType: input.masterMimeType,
      sourceMimeType: input.sourceMimeType,
      sourceName: input.sourceName,
      sizeBytes: input.sizeBytes,
      width: input.width,
      height: input.height,
    })
    .returning()
  return asset!
}

export async function recordExport(input: {
  projectId: string
  sourceFingerprint: string
  pdfObjectKey: string
  reportObjectKey: string
  report: (typeof exportsTable.$inferInsert)["report"]
}): Promise<string> {
  const id = crypto.randomUUID()
  await db.insert(exportsTable).values({ id, ...input })
  return id
}

export async function getExport(exportId: string) {
  const [record] = await db.select().from(exportsTable).where(eq(exportsTable.id, exportId))
  if (!record) throw new HttpError(404, "Export not found.")
  return record
}
