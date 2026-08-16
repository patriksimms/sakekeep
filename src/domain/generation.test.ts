import { describe, expect, it } from "vitest"

import {
  deterministicLayoutAssignments,
  effectivePpi,
  fitText,
  generateBook,
  inspectSubmissionPage,
} from "./generation.ts"
import { completeForm, cycleSettings, layoutFixture, submissionFixture } from "../test/fixtures.ts"
import { addElement } from "./layout.ts"

const submissionIds = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
]

describe("book generation", () => {
  it("cycles layouts and reproduces seeded-random assignments", () => {
    const submissions = submissionIds.map(submissionFixture)
    const layouts = [
      layoutFixture("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 0),
      layoutFixture("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", 1),
    ]
    const cycled = deterministicLayoutAssignments(submissions, layouts, cycleSettings)
    expect(Object.values(cycled)).toEqual([layouts[0]!.id, layouts[1]!.id, layouts[0]!.id])
    const randomSettings = {
      ...cycleSettings,
      mode: "seeded-random" as const,
    }
    expect(deterministicLayoutAssignments(submissions, layouts, randomSettings)).toEqual(
      deterministicLayoutAssignments(submissions, layouts, randomSettings)
    )
  })

  it("preserves manual assignments, standalone pages, and page order", () => {
    const submissions = submissionIds.slice(0, 2).map(submissionFixture)
    const layouts = [
      layoutFixture("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 0),
      layoutFixture("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", 1),
    ]
    const first = generateBook({
      projectId: layouts[0]!.projectId,
      form: completeForm,
      submissions,
      layouts,
      settings: cycleSettings,
      now: "2026-07-18T00:00:00.000Z",
    })
    const standalone = {
      id: "standalone:cover",
      kind: "standalone" as const,
      pageType: "cover" as const,
      title: "Our book",
      body: "",
      background: "#fffdf7",
      problems: [],
    }
    const previousBook = {
      ...first,
      pages: [standalone, first.pages[1]!, first.pages[0]!],
    }
    const manual = {
      ...cycleSettings,
      manualAssignments: { [submissions[0]!.id]: layouts[1]!.id },
    }
    const regenerated = generateBook({
      projectId: layouts[0]!.projectId,
      form: completeForm,
      submissions,
      layouts,
      settings: manual,
      previousBook,
      now: "2026-07-18T00:01:00.000Z",
    })
    expect(regenerated.pages.map((page) => page.id)).toEqual(
      previousBook.pages.map((page) => page.id)
    )
    expect(
      regenerated.pages.find(
        (page) => page.kind === "submission" && page.submissionId === submissions[0]!.id
      )
    ).toMatchObject({ layoutId: layouts[1]!.id })
  })

  it("implements overflow and effective resolution thresholds", () => {
    expect(fitText("Short", 100, 30, 16, 8, 1.2, "flag")).toMatchObject({
      fits: true,
      requiredLines: 1,
      availableLines: 4,
    })
    const long = "A very long memory ".repeat(80)
    expect(fitText(long, 20, 8, 20, 8, 1.4, "flag")).toMatchObject({
      fits: false,
      effectiveFontSize: 20,
      availableLines: 0,
    })
    expect(fitText(long, 20, 8, 20, 8, 1.4, "truncate")).toMatchObject({
      fits: true,
      truncated: true,
    })
    expect(effectivePpi(3000, 2000, 254, 127)).toBe(300)
  })

  it.each([
    [
      "shrink",
      true,
      "A memory overflows on Response 1. It needs 3 lines at the 8 pt minimum, but only 2 lines fit.",
    ],
    [
      "flag",
      true,
      "A memory overflows on Response 1. It needs 3 lines at the configured 20 pt size, but only 1 line fits.",
    ],
    [
      "truncate",
      false,
      "A memory is truncated on Response 1. It needs 3 lines at the configured 20 pt size, but only 1 line fits.",
    ],
  ] as const)("describes %s overflow with its relevant constraint", (policy, blocking, message) => {
    const layout = layoutFixture()
    const element = layout.schema.elements.find((candidate) => candidate.type === "bound-text")!
    if (element.type !== "bound-text") throw new Error("Expected bound text fixture")
    element.geometry = { ...element.geometry, width: 100, height: 8 }
    element.text = {
      ...element.text,
      fontSize: 20,
      minFontSize: 8,
      lineHeight: 1,
      overflow: policy,
    }
    const submission = submissionFixture(submissionIds[0]!, 1)
    submission.answers.memory = "one\ntwo\nthree"

    expect(inspectSubmissionPage("page", layout, submission, completeForm, [])).toContainEqual(
      expect.objectContaining({
        code: "text-overflow",
        elementId: element.id,
        blocking,
        message,
      })
    )
  })

  it("distinguishes a text bounding box that is too short for one line", () => {
    const layout = layoutFixture()
    const element = layout.schema.elements.find((candidate) => candidate.type === "bound-text")!
    if (element.type !== "bound-text") throw new Error("Expected bound text fixture")
    element.geometry = { ...element.geometry, width: 100, height: 5 }
    element.text = { ...element.text, fontSize: 20, lineHeight: 1, overflow: "flag" }
    element.showLabel = true
    element.label = "Best memory"
    const submission = submissionFixture(submissionIds[0]!, 1)
    submission.answers.memory = "one"

    expect(inspectSubmissionPage("page", layout, submission, completeForm, [])).toContainEqual(
      expect.objectContaining({
        message:
          "Best memory overflows on Response 1. Its text bounding box is too short for one line at the configured 20 pt size (needs 7.06 mm, has 5.00 mm).",
      })
    )
  })

  it("reports blocking low-resolution images and honors explicit overrides", () => {
    const layout = layoutFixture()
    const submission = {
      ...submissionFixture(submissionIds[0]!, 0),
      answers: {
        ...submissionFixture(submissionIds[0]!, 0).answers,
        photos: [
          {
            assetId: "asset-low",
            name: "small.jpg",
            mimeType: "image/jpeg",
            width: 100,
            height: 100,
            sizeBytes: 1_000,
            previewUrl: "/preview",
            masterUrl: "/master",
          },
        ],
      },
    }
    const blocked = inspectSubmissionPage("page", layout, submission, completeForm, [])
    expect(
      blocked.some((problem) => problem.code === "image-blocking-resolution" && problem.blocking)
    ).toBe(true)
    const overridden = inspectSubmissionPage("page", layout, submission, completeForm, [
      "asset-low",
    ])
    expect(overridden.some((problem) => problem.code === "image-blocking-resolution")).toBe(false)
    expect(overridden.some((problem) => problem.code === "image-low-resolution")).toBe(true)
  })

  it("blocks unsupported legacy print-master formats", () => {
    const submission = submissionFixture(submissionIds[0]!, 0)
    submission.answers.photos = [
      {
        assetId: "asset-legacy",
        name: "legacy.gif",
        mimeType: "image/gif",
        width: 1200,
        height: 900,
        sizeBytes: 1_000,
        previewUrl: "/preview",
        masterUrl: "/master",
      },
    ]

    expect(
      inspectSubmissionPage("page", layoutFixture(), submission, completeForm, [])
    ).toContainEqual(
      expect.objectContaining({
        assetId: "asset-legacy",
        code: "unsupported-asset",
        blocking: true,
      })
    )
  })

  it("warns about empty decorative images without blocking generation", () => {
    const layout = layoutFixture()
    layout.schema = addElement(layout.schema, "decorative-image")
    expect(
      inspectSubmissionPage(
        "page",
        layout,
        submissionFixture(submissionIds[0]!, 0),
        completeForm,
        []
      )
    ).toContainEqual(
      expect.objectContaining({
        code: "empty-decorative-image",
        blocking: false,
      })
    )
  })
})
