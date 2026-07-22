export const workspaceSteps = ["form", "responses", "layouts", "book", "export"] as const

export type WorkspaceStep = (typeof workspaceSteps)[number]

export function parseWorkspaceStep(value: unknown): WorkspaceStep | undefined {
  return typeof value === "string" && workspaceSteps.includes(value as WorkspaceStep)
    ? (value as WorkspaceStep)
    : undefined
}
