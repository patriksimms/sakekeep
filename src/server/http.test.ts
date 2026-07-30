import { describe, expect, it } from "vitest"
import { z } from "zod"

import { HttpError, jsonError } from "./http.ts"

describe("jsonError", () => {
  it("passes an HttpError through with its status and details", async () => {
    const response = jsonError(
      new HttpError(422, "Nope.", { issues: [{ path: "a", message: "b" }] })
    )
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({
      error: "Nope.",
      details: { issues: [{ path: "a", message: "b" }] },
    })
  })

  it("reports a rejected request body as 422 with per-field issues", async () => {
    const schema = z.object({
      formSchema: z.object({ questions: z.array(z.object({ prompt: z.string().max(3) })) }),
    })
    const error = schema.safeParse({
      formSchema: { questions: [{ prompt: "far too long" }] },
    }).error

    const response = jsonError(error)
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      error: "The request contains invalid data.",
      details: {
        issues: [{ path: "formSchema.questions.0.prompt" }],
      },
    })
  })

  it("still hides genuinely unexpected failures behind a 500", async () => {
    const response = jsonError(new Error("connection reset"))
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: "An unexpected local server error occurred.",
    })
  })
})
