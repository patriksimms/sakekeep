import { describe, expect, it } from "vitest"

import { parseWorkspaceStep, workspaceSteps } from "#/domain/workspace-tabs.ts"

describe("workspace tab search parameter", () => {
  it.each(workspaceSteps)("accepts %s", (step) => {
    expect(parseWorkspaceStep(step)).toBe(step)
  })

  it.each([undefined, null, "", "unknown", ["layouts"]])(
    "falls back for an invalid value of %j",
    (value) => {
      expect(parseWorkspaceStep(value)).toBeUndefined()
    }
  )
})
