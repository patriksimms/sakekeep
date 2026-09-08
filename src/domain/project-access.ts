export type ProjectRole = "owner" | "organizer" | "editor"
export type CollaboratorRole = Exclude<ProjectRole, "owner">

export function canManageProject(role: ProjectRole | undefined) {
  return role === "owner" || role === "organizer"
}

export interface ProjectAccess {
  role: ProjectRole
  ownerUserId: string
  members: Array<{ userId: string; email: string; role: CollaboratorRole }>
  invitations: Array<{ id: string; email: string; role: CollaboratorRole; expiresAt: string }>
}
