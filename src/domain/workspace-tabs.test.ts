import { describe, expect, it } from "vitest"

import {
  defaultWorkspaceStep,
  parseWorkspaceStep,
  workspaceStepAfterStateChange,
  workspaceSteps,
} from "#/domain/workspace-tabs.ts"

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

describe("default workspace tab", () => {
  it.each([
    ["draft", "form"],
    ["collecting", "responses"],
    ["closed", "layouts"],
  ] as const)("opens a %s project on %s", (state, expected) => {
    expect(defaultWorkspaceStep(state)).toBe(expected)
  })

  it("moves from form to responses when collection starts", () => {
    expect(workspaceStepAfterStateChange("draft", "collecting")).toBe("responses")
  })

  it("moves from responses to layouts when collection closes", () => {
    expect(workspaceStepAfterStateChange("collecting", "closed")).toBe("layouts")
  })

  it("preserves the selected tab when the project state does not change", () => {
    expect(workspaceStepAfterStateChange("closed", "closed")).toBeUndefined()
  })
})
