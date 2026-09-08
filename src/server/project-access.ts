import * as m from "#/paraglide/messages.js"
import { createHash, randomBytes } from "node:crypto"
import { and, eq, gt, isNull, or } from "drizzle-orm"
import { z } from "zod"
import {
  canManageProject,
  type CollaboratorRole,
  type ProjectAccess,
  type ProjectRole,
} from "../domain/project-access"
import { db } from "./db"
import { projects, projectMembers, projectInvitations } from "./db/schema"
import { HttpError } from "./http"

export const collaboratorRoleSchema = z.enum(["organizer", "editor"])
export const invitationEmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(320))
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex")
type Database = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function projectRole(
  projectId: string,
  userId: string,
  database: Database = db
): Promise<ProjectRole> {
  const [row] = await database
    .select({ owner: projects.ownerUserId, role: projectMembers.role })
    .from(projects)
    .leftJoin(
      projectMembers,
      and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId))
    )
    .where(eq(projects.id, projectId))
  // An unassigned legacy project is inaccessible until its owner has been backfilled.
  if (!row?.owner) throw new HttpError(404, m.access_error_1())
  if (row.owner === userId) return "owner"
  if (row.role) return row.role
  throw new HttpError(404, m.access_error_1())
}

export async function requireProjectRole(
  projectId: string,
  userId: string,
  permission: "edit" | "manage" | "owner" = "edit",
  database: Database = db
) {
  const role = await projectRole(projectId, userId, database)
  if (
    (permission === "owner" && role !== "owner") ||
    (permission === "manage" && !canManageProject(role))
  ) {
    throw new HttpError(403, m.access_error_2())
  }
  return role
}

async function lockProject(database: Database, projectId: string) {
  const [project] = await database
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .for("update")
  if (!project) throw new HttpError(404, m.access_error_1())
  return project
}

export async function getProjectAccess(projectId: string, userId: string): Promise<ProjectAccess> {
  const role = await projectRole(projectId, userId)
  const [project] = await db
    .select({ owner: projects.ownerUserId })
    .from(projects)
    .where(eq(projects.id, projectId))
  if (!project?.owner) throw new HttpError(404, m.access_error_1())
  const members = canManageProject(role)
    ? await db
        .select({
          userId: projectMembers.userId,
          email: projectMembers.email,
          role: projectMembers.role,
        })
        .from(projectMembers)
        .where(eq(projectMembers.projectId, projectId))
    : []
  const invitations = canManageProject(role)
    ? await db
        .select({
          id: projectInvitations.id,
          email: projectInvitations.email,
          role: projectInvitations.role,
          expiresAt: projectInvitations.expiresAt,
        })
        .from(projectInvitations)
        .where(
          and(
            eq(projectInvitations.projectId, projectId),
            isNull(projectInvitations.acceptedBy),
            isNull(projectInvitations.revokedAt),
            gt(projectInvitations.expiresAt, new Date())
          )
        )
    : []
  return {
    role,
    ownerUserId: project.owner,
    members,
    invitations: invitations.map((invite) => ({
      ...invite,
      expiresAt: invite.expiresAt.toISOString(),
    })),
  }
}

export async function inviteCollaborator(
  projectId: string,
  userId: string,
  rawEmail: string,
  role: CollaboratorRole,
  deliver: (email: string, token: string) => Promise<void>
) {
  const email = invitationEmailSchema.parse(rawEmail)
  const token = randomBytes(32).toString("base64url")
  const id = crypto.randomUUID()
  await db.transaction(async (tx) => {
    await lockProject(tx, projectId)
    await requireProjectRole(projectId, userId, "manage", tx)
    // A replacement invitation invalidates older links for this project and address.
    await tx
      .update(projectInvitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(projectInvitations.projectId, projectId),
          eq(projectInvitations.email, email),
          isNull(projectInvitations.acceptedBy),
          isNull(projectInvitations.revokedAt)
        )
      )
    await tx.insert(projectInvitations).values({
      id,
      projectId,
      email,
      role,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    })
  })
  try {
    await deliver(email, token)
  } catch {
    await db
      .update(projectInvitations)
      .set({ revokedAt: new Date() })
      .where(eq(projectInvitations.id, id))
    throw new HttpError(502, m.access_error_3())
  }
  await db
    .update(projectInvitations)
    .set({ deliveredAt: new Date() })
    .where(eq(projectInvitations.id, id))
  return { id }
}

export async function acceptInvitation(token: string, userId: string, verifiedEmails: string[]) {
  const [invite] = await db
    .select()
    .from(projectInvitations)
    .where(eq(projectInvitations.tokenHash, tokenHash(token)))
  if (!invite) throw new HttpError(404, m.access_error_4())
  return db.transaction(async (tx) => {
    const project = await lockProject(tx, invite.projectId)
    const [current] = await tx
      .select()
      .from(projectInvitations)
      .where(eq(projectInvitations.id, invite.id))
      .for("update")
    if (
      !current ||
      current.revokedAt ||
      !current.deliveredAt ||
      current.expiresAt <= new Date() ||
      !project.ownerUserId
    )
      throw new HttpError(410, m.access_error_5())
    if (!verifiedEmails.some((email) => email.toLowerCase() === current.email))
      throw new HttpError(403, m.access_error_6())
    if (current.acceptedBy) {
      if (current.acceptedBy !== userId) throw new HttpError(410, m.access_error_7())
      await projectRole(project.id, userId, tx)
      return { projectId: project.id }
    }
    // Accepting another invitation never changes an existing collaborator's role.
    if (project.ownerUserId !== userId)
      await tx
        .insert(projectMembers)
        .values({ projectId: project.id, userId, email: current.email, role: current.role })
        .onConflictDoNothing()
    await tx
      .update(projectInvitations)
      .set({ acceptedBy: userId })
      .where(eq(projectInvitations.id, current.id))
    return { projectId: project.id }
  })
}

export async function changeCollaborator(
  projectId: string,
  actorId: string,
  userId: string,
  role: CollaboratorRole | null
) {
  await db.transaction(async (tx) => {
    const project = await lockProject(tx, projectId)
    await requireProjectRole(projectId, actorId, "manage", tx)
    if (project.ownerUserId === userId) throw new HttpError(403, m.access_error_8())
    const [member] = await tx
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    if (!member) throw new HttpError(404, m.access_error_9())
    const where = and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))
    if (role) await tx.update(projectMembers).set({ role }).where(where)
    else {
      await tx.delete(projectMembers).where(where)
      await tx
        .update(projectInvitations)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(projectInvitations.projectId, projectId),
            or(
              eq(projectInvitations.acceptedBy, userId),
              eq(projectInvitations.email, member.email)
            )
          )
        )
    }
  })
}

export async function revokeInvitation(projectId: string, userId: string, invitationId: string) {
  await db.transaction(async (tx) => {
    await lockProject(tx, projectId)
    await requireProjectRole(projectId, userId, "manage", tx)
    await tx
      .update(projectInvitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(projectInvitations.id, invitationId),
          eq(projectInvitations.projectId, projectId),
          isNull(projectInvitations.acceptedBy)
        )
      )
  })
}

export async function transferOwnership(
  projectId: string,
  userId: string,
  targetId: string,
  ownerEmail: string
) {
  await db.transaction(async (tx) => {
    await lockProject(tx, projectId)
    await requireProjectRole(projectId, userId, "owner", tx)
    const [target] = await tx
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, targetId)))
    if (!target) throw new HttpError(400, m.access_error_10())
    await tx
      .insert(projectMembers)
      .values({ projectId, userId, email: ownerEmail, role: "organizer" })
      .onConflictDoUpdate({
        target: [projectMembers.projectId, projectMembers.userId],
        set: { role: "organizer" },
      })
    await tx
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, targetId)))
    await tx.update(projects).set({ ownerUserId: targetId }).where(eq(projects.id, projectId))
  })
}
