import { afterEach, describe, expect, it, vi } from "vitest"

import { captureServerException, setServerExceptionSinkForTesting } from "./error-tracking.ts"

afterEach(() => {
  setServerExceptionSinkForTesting(undefined)
})

describe("captureServerException", () => {
  it("reports errors with a fixed distinct id and no extra properties", () => {
    const captureException = vi.fn()
    setServerExceptionSinkForTesting({ captureException })

    const failure = new Error("database unavailable")
    captureServerException(failure)

    expect(captureException).toHaveBeenCalledExactlyOnceWith(failure, "sakekeep-server")
  })

  it("wraps non-Error values", () => {
    const captureException = vi.fn()
    setServerExceptionSinkForTesting({ captureException })

    captureServerException("boom")

    const [reported] = captureException.mock.calls[0] ?? []
    expect(reported).toBeInstanceOf(Error)
    expect((reported as Error).message).toBe("boom")
  })

  it("does nothing without a configured sink", () => {
    setServerExceptionSinkForTesting(null)
    expect(() => captureServerException(new Error("ignored"))).not.toThrow()
  })

  it("swallows sink failures", () => {
    setServerExceptionSinkForTesting({
      captureException: () => {
        throw new Error("posthog down")
      },
    })
    expect(() => captureServerException(new Error("original"))).not.toThrow()
  })
})
