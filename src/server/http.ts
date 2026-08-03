import { z } from "zod"

import { captureServerException } from "#/server/error-tracking.ts"

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = "HttpError"
  }
}

export function jsonError(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message, details: error.details }, { status: error.status })
  }
  // A route schema rejecting the body is the caller's fault, not ours. Reporting it as an opaque
  // 500 loses every path and message the client needs to show the user which field is wrong.
  if (error instanceof z.ZodError) {
    return Response.json(
      {
        error: "The request contains invalid data.",
        details: {
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 422 }
    )
  }
  console.error(error)
  captureServerException(error)
  return Response.json({ error: "An unexpected local server error occurred." }, { status: 500 })
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new HttpError(400, "The request body must be valid JSON.")
  }
}
