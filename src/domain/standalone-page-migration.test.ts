import { describe, expect, it } from "vitest"

import {
  convertLegacyStandalonePages,
  isLegacyStandalonePage,
  legacyStandaloneName,
  legacyStandaloneRole,
  legacyStandaloneSchema,
  type LegacyStandaloneBookPage,
} from "./standalone-page-migration.ts"
import { pageSpecification } from "./page-format.ts"
import { type BookPage } from "./types.ts"

const specification = pageSpecification("a5", "landscape")

function legacyPage(overrides: Partial<LegacyStandaloneBookPage> = {}): LegacyStandaloneBookPage {
  return {
    id: "standalone:legacy",
    kind: "standalone",
    pageType: "cover",
    title: "A book of memories",
    body: "For Lea, from everyone.",
    background: "#f4ede1",
    problems: [],
    ...overrides,
  }
}

const submissionPage: BookPage = {
  id: "submission:1",
  kind: "submission",
  submissionId: "10000000-0000-4000-8000-000000000001",
  layoutId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  problems: [],
}

describe("legacy standalone page detection", () => {
  it("recognises a page that still carries its own text", () => {
    expect(isLegacyStandalonePage(legacyPage())).toBe(true)
  })

  it("ignores layout-backed and submission pages", () => {
    expect(
      isLegacyStandalonePage({
        id: "standalone:new",
        kind: "standalone",
        layoutId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        problems: [],
      })
    ).toBe(false)
    expect(isLegacyStandalonePage(submissionPage)).toBe(false)
  })
})

describe("legacy standalone page schema", () => {
  it("keeps the background and places the title above the body inside the trim", () => {
    const schema = legacyStandaloneSchema(legacyPage(), specification)

    expect(schema.background).toBe("#f4ede1")
    expect(schema.trim).toEqual({
      widthMm: specification.trimWidthMm,
      heightMm: specification.trimHeightMm,
    })
    const [title, body] = schema.elements
    expect(title).toMatchObject({ type: "static-text", content: "A book of memories" })
    expect(body).toMatchObject({ type: "static-text", content: "For Lea, from everyone." })
    for (const element of schema.elements) {
      expect(element.geometry.x).toBeGreaterThanOrEqual(specification.safeMarginMm)
      expect(element.geometry.y).toBeGreaterThanOrEqual(specification.safeMarginMm)
      expect(element.geometry.x + element.geometry.width).toBeLessThanOrEqual(
        specification.trimWidthMm - specification.safeMarginMm
      )
      expect(element.geometry.y + element.geometry.height).toBeLessThanOrEqual(
        specification.trimHeightMm - specification.safeMarginMm
      )
    }
    expect(title!.geometry.y).toBeLessThan(body!.geometry.y)
  })

  it("omits empty text and leaves a blank page without elements", () => {
    expect(legacyStandaloneSchema(legacyPage({ body: "" }), specification).elements).toHaveLength(1)
    expect(
      legacyStandaloneSchema(legacyPage({ pageType: "blank", title: "", body: "" }), specification)
        .elements
    ).toEqual([])
  })

  it("names the layout after the title, falling back to the page type", () => {
    expect(legacyStandaloneName(legacyPage())).toBe("A book of memories")
    expect(legacyStandaloneName(legacyPage({ pageType: "blank", title: "" }))).toBe("Blank page")
  })
})

describe("legacy standalone page conversion", () => {
  it("skips books that hold no legacy page", () => {
    expect(
      convertLegacyStandalonePages({
        pages: [submissionPage],
        specification,
        takenRoles: [],
        newLayoutId: () => "unused",
      })
    ).toBeNull()
  })

  it("claims a cover role only where that cover already sat", () => {
    expect(legacyStandaloneRole(legacyPage(), 0, 3)).toBe("front-cover")
    expect(legacyStandaloneRole(legacyPage(), 1, 3)).toBe("static")
    expect(legacyStandaloneRole(legacyPage({ pageType: "closing" }), 2, 3)).toBe("back-cover")
    expect(legacyStandaloneRole(legacyPage({ pageType: "closing" }), 1, 3)).toBe("static")
    expect(legacyStandaloneRole(legacyPage({ pageType: "introduction" }), 0, 3)).toBe("static")
  })

  it("rewrites every legacy page in place and preserves the order", () => {
    let counter = 0
    const conversion = convertLegacyStandalonePages({
      pages: [
        legacyPage({ id: "standalone:cover" }),
        submissionPage,
        legacyPage({ id: "standalone:closing", pageType: "closing", title: "Thank you" }),
      ],
      specification,
      takenRoles: [],
      newLayoutId: () => `layout-${(counter += 1)}`,
    })

    expect(conversion).not.toBeNull()
    expect(conversion!.pages.map((page) => page.id)).toEqual([
      "standalone:cover",
      "submission:1",
      "standalone:closing",
    ])
    expect(conversion!.pages[1]).toBe(submissionPage)
    expect(conversion!.layouts.map((layout) => layout.role)).toEqual(["front-cover", "back-cover"])
    expect(conversion!.pages[0]).toMatchObject({ kind: "standalone", layoutId: "layout-1" })
    expect(conversion!.pages[2]).toMatchObject({ kind: "standalone", layoutId: "layout-2" })
    expect(conversion!.pages[0]).not.toHaveProperty("title")
  })

  it("falls back to a standalone role when the project already owns that cover", () => {
    const conversion = convertLegacyStandalonePages({
      pages: [legacyPage()],
      specification,
      takenRoles: ["submission", "front-cover"],
      newLayoutId: () => "layout-1",
    })

    expect(conversion!.layouts[0]!.role).toBe("static")
  })

  it("gives a second legacy cover a standalone role rather than a duplicate", () => {
    let counter = 0
    const conversion = convertLegacyStandalonePages({
      pages: [legacyPage({ id: "a" }), legacyPage({ id: "b" })],
      specification,
      takenRoles: [],
      newLayoutId: () => `layout-${(counter += 1)}`,
    })

    expect(conversion!.layouts.map((layout) => layout.role)).toEqual(["front-cover", "static"])
  })
})
