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
  console.error(error)
  return Response.json({ error: "An unexpected local server error occurred." }, { status: 500 })
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new HttpError(400, "The request body must be valid JSON.")
  }
}
