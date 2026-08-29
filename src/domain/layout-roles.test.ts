import { describe, expect, it } from "vitest"

import {
  LAYOUT_ROLES,
  allowsResponseBoundElements,
  defaultLayoutName,
  findLayoutByRole,
  isCoverRole,
  isResponseBoundElement,
  layoutRoleLabel,
  orderedLayouts,
  reorderableLayouts,
  responseLayouts,
} from "./layout-roles.ts"
import { layoutFixture, standaloneLayoutFixture } from "../test/fixtures.ts"
import { type LayoutRecord, type LayoutRole } from "./types.ts"

function roleFixture(role: LayoutRole, position: number): LayoutRecord {
  return role === "submission"
    ? { ...layoutFixture(`aaaaaaaa-aaaa-4aaa-8aaa-${position}0000000000`, position) }
    : standaloneLayoutFixture(`cccccccc-cccc-4ccc-8ccc-${position}0000000000`, role, position)
}

describe("layout roles", () => {
  it.each(LAYOUT_ROLES)("labels %s", (role) => {
    expect(layoutRoleLabel(role)).toBeTruthy()
  })

  it("treats only the two covers as pinned singletons", () => {
    expect(LAYOUT_ROLES.filter(isCoverRole)).toEqual(["front-cover", "back-cover"])
  })

  it("allows response-bound elements only on response layouts", () => {
    expect(allowsResponseBoundElements("submission")).toBe(true)
    for (const role of LAYOUT_ROLES.filter((candidate) => candidate !== "submission")) {
      expect(allowsResponseBoundElements(role)).toBe(false)
    }
    expect(isResponseBoundElement("bound-text")).toBe(true)
    expect(isResponseBoundElement("image-frame")).toBe(true)
    expect(isResponseBoundElement("gallery-frame")).toBe(true)
    expect(isResponseBoundElement("static-text")).toBe(false)
    expect(isResponseBoundElement("rectangle")).toBe(false)
  })

  it("puts the front cover first and the back cover last, whatever their positions", () => {
    const back = roleFixture("back-cover", 0)
    const response = roleFixture("submission", 1)
    const standalone = roleFixture("static", 2)
    const front = roleFixture("front-cover", 3)

    expect(
      orderedLayouts([back, response, standalone, front]).map((layout) => layout.role)
    ).toEqual(["front-cover", "submission", "static", "back-cover"])
  })

  it("excludes covers from reordering and from response assignment", () => {
    const layouts = [
      roleFixture("front-cover", 0),
      roleFixture("submission", 1),
      roleFixture("static", 2),
      roleFixture("back-cover", 3),
    ]

    expect(reorderableLayouts(layouts).map((layout) => layout.role)).toEqual([
      "submission",
      "static",
    ])
    expect(responseLayouts(layouts).map((layout) => layout.role)).toEqual(["submission"])
  })

  it("finds a cover by role and reports its absence", () => {
    const layouts = [roleFixture("submission", 0), roleFixture("front-cover", 1)]

    expect(findLayoutByRole(layouts, "front-cover")?.role).toBe("front-cover")
    expect(findLayoutByRole(layouts, "back-cover")).toBeUndefined()
  })

  it("numbers response layouts but names standalone ones after their role", () => {
    expect(defaultLayoutName("submission", 2)).toBe("Layout 3")
    expect(defaultLayoutName("front-cover", 2)).toBe("Front cover")
    expect(defaultLayoutName("static", 0)).toBe("Standalone page")
  })
})
