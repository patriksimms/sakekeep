import { type ProjectState } from "#/domain/types.ts"

export const workspaceSteps = ["form", "responses", "layouts", "book", "export"] as const

export type WorkspaceStep = (typeof workspaceSteps)[number]

export function parseWorkspaceStep(value: unknown): WorkspaceStep | undefined {
  return typeof value === "string" && workspaceSteps.includes(value as WorkspaceStep)
    ? (value as WorkspaceStep)
    : undefined
}

export function defaultWorkspaceStep(state: ProjectState): WorkspaceStep {
  if (state === "draft") return "form"
  if (state === "collecting") return "responses"
  return "layouts"
}

export function workspaceStepAfterStateChange(
  previousState: ProjectState,
  nextState: ProjectState
): WorkspaceStep | undefined {
  return previousState === nextState ? undefined : defaultWorkspaceStep(nextState)
}
