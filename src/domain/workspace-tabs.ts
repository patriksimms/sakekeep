export const workspaceSteps = ["form", "responses", "layouts", "book", "export"] as const

export type WorkspaceStep = (typeof workspaceSteps)[number]

export function parseWorkspaceStep(value: unknown): WorkspaceStep | undefined {
  return typeof value === "string" && workspaceSteps.includes(value as WorkspaceStep)
    ? (value as WorkspaceStep)
    : undefined
}

// The book review step has two views: a grid of every generated page, and the single-page
// detail view. Grid is the default, so it stays absent from the URL.
export const bookViews = ["grid", "detail"] as const

export type BookView = (typeof bookViews)[number]

export function parseBookView(value: unknown): BookView | undefined {
  return typeof value === "string" && bookViews.includes(value as BookView)
    ? (value as BookView)
    : undefined
}
