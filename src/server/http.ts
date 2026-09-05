import * as m from "#/paraglide/messages.js"
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
        error: m.ui_the_request_contains_invalid_data(),
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
  return Response.json({ error: m.ui_an_unexpected_local_server_error_occurred() }, { status: 500 })
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new HttpError(400, m.ui_the_request_body_must_be_valid_json())
  }
}
