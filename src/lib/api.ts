import { type ExportArtifact, type Project, type ProjectSummary } from "#/domain/types.ts"

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }
  const response = await fetch(url, { ...init, headers })
  if (!response.ok) {
    let payload: { error?: string; details?: unknown } = {}
    try {
      payload = (await response.json()) as typeof payload
    } catch {
      // Keep the status-based fallback below.
    }
    throw new ApiError(
      response.status,
      payload.error ?? `Request failed with HTTP ${response.status}.`,
      payload.details
    )
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const projectApi = {
  list: () => api<{ projects: ProjectSummary[] }>("/api/projects"),
  create: (input: { title: string; occasion?: string | null }) =>
    api<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  get: (projectId: string, submissions = false) =>
    api<Project>(`/api/projects/${projectId}${submissions ? "?submissions=true" : ""}`),
  update: (projectId: string, input: object) =>
    api<Project>(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (projectId: string) => api<void>(`/api/projects/${projectId}`, { method: "DELETE" }),
  action: (projectId: string, action: "publish" | "close" | "duplicate") =>
    api<Project>(`/api/projects/${projectId}/${action}`, { method: "POST" }),
  layoutAction: <T>(projectId: string, input: object) =>
    api<T>(`/api/projects/${projectId}/layouts`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateLayout: <T>(projectId: string, layoutId: string, input: object) =>
    api<T>(`/api/projects/${projectId}/layouts/${layoutId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteLayout: (projectId: string, layoutId: string) =>
    api<void>(`/api/projects/${projectId}/layouts/${layoutId}`, {
      method: "DELETE",
    }),
  generate: (projectId: string, settings: object) =>
    api<Project["book"]>(`/api/projects/${projectId}/book`, {
      method: "POST",
      body: JSON.stringify(settings),
    }),
  updateBook: (projectId: string, input: object) =>
    api<NonNullable<Project["book"]>>(`/api/projects/${projectId}/book`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  export: (projectId: string, marks: boolean) =>
    api<ExportArtifact>(`/api/projects/${projectId}/export`, {
      method: "POST",
      body: JSON.stringify({ marks }),
    }),
}
