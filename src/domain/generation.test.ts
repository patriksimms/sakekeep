import { describe, expect, it } from "vitest"

import {
  deterministicLayoutAssignments,
  effectivePpi,
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

  it("calculates effective resolution thresholds", () => {
    expect(effectivePpi(3000, 2000, 254, 127)).toBe(300)
  })

  it.each([
    [
      "shrink",
      true,
      "A memory overflows on Response 1. It needs 4 lines at the 8 pt minimum, but only 2 lines fit.",
    ],
    [
      "flag",
      true,
      "A memory overflows on Response 1. It needs 4 lines at the configured 20 pt size, but only 1 line fits.",
    ],
    [
      "truncate",
      false,
      "A memory is truncated on Response 1. It needs 4 lines at the configured 20 pt size, but only 1 line fits.",
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

  it("includes the fallback question label when measuring bound text", () => {
    const layout = layoutFixture()
    const element = layout.schema.elements.find((candidate) => candidate.type === "bound-text")!
    if (element.type !== "bound-text") throw new Error("Expected bound text fixture")
    element.geometry = { ...element.geometry, width: 100, height: 8 }
    element.text = { ...element.text, fontSize: 20, lineHeight: 1, overflow: "flag" }
    element.showLabel = true
    element.label = ""
    const submission = submissionFixture(submissionIds[0]!, 1)
    submission.answers.memory = "one"

    expect(inspectSubmissionPage("page", layout, submission, completeForm, [])).toContainEqual(
      expect.objectContaining({
        code: "text-overflow",
        message:
          "A memory overflows on Response 1. It needs 2 lines at the configured 20 pt size, but only 1 line fits.",
      })
    )
  })

  it("still reports a missing required answer when a fallback label is visible", () => {
    const layout = layoutFixture()
    const element = layout.schema.elements.find((candidate) => candidate.type === "bound-text")!
    if (element.type !== "bound-text") throw new Error("Expected bound text fixture")
    element.showLabel = true
    element.label = ""
    const submission = submissionFixture(submissionIds[0]!, 1)
    submission.answers.memory = ""

    expect(inspectSubmissionPage("page", layout, submission, completeForm, [])).toContainEqual(
      expect.objectContaining({
        code: "missing-required-answer",
        elementId: element.id,
        blocking: true,
      })
    )
  })

  it.each([
    "static-text",
    "image-frame",
    "gallery-frame",
    "rectangle",
    "circle",
    "line",
    "decorative-image",
  ] as const)("warns when a %s extends beyond the bleed boundary", (type) => {
    const layout = layoutFixture()
    layout.schema = addElement(
      layout.schema,
      type,
      type === "image-frame" || type === "gallery-frame" ? "photos" : undefined
    )
    const element = layout.schema.elements.at(-1)!
    element.geometry = { ...element.geometry, x: -4 }

    expect(
      inspectSubmissionPage(
        "page",
        layout,
        submissionFixture(submissionIds[0]!, 1),
        completeForm,
        []
      )
    ).toContainEqual(
      expect.objectContaining({
        code: "outside-print-area",
        elementId: element.id,
        blocking: false,
      })
    )
  })

  it("keeps question-bound text beyond the bleed boundary blocking", () => {
    const layout = layoutFixture()
    const element = layout.schema.elements.find((candidate) => candidate.type === "bound-text")!
    element.geometry = { ...element.geometry, x: -4 }

    expect(
      inspectSubmissionPage(
        "page",
        layout,
        submissionFixture(submissionIds[0]!, 1),
        completeForm,
        []
      )
    ).toContainEqual(
      expect.objectContaining({
        code: "outside-print-area",
        elementId: element.id,
        blocking: true,
      })
    )
  })

  it("distinguishes repeated text bounding boxes bound to the same question", () => {
    const layout = layoutFixture()
    const element = layout.schema.elements.find((candidate) => candidate.type === "bound-text")!
    if (element.type !== "bound-text") throw new Error("Expected bound text fixture")
    element.geometry = { ...element.geometry, width: 100, height: 5 }
    element.text = { ...element.text, fontSize: 20, lineHeight: 1, overflow: "flag" }
    layout.schema.elements.push({ ...element, id: "repeated-memory" })

    const problems = inspectSubmissionPage(
      "page",
      layout,
      submissionFixture(submissionIds[0]!, 1),
      completeForm,
      []
    ).filter((problem) => problem.code === "text-overflow")

    expect(problems.map((problem) => problem.message)).toEqual([
      expect.stringContaining("A memory (text bounding box 1) overflows"),
      expect.stringContaining("A memory (text bounding box 2) overflows"),
    ])
    expect(new Set(problems.map((problem) => problem.message))).toHaveLength(2)
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
