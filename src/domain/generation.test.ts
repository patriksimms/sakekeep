import { describe, expect, it } from "vitest"

import {
  deterministicLayoutAssignments,
  effectivePpi,
  fitText,
  generateBook,
  inspectSubmissionPage,
} from "./generation.ts"
import { completeForm, cycleSettings, layoutFixture, submissionFixture } from "../test/fixtures.ts"

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
    expect(fitText("Short", 100, 30, 16, 8, 1.2, "flag").fits).toBe(true)
    const long = "A very long memory ".repeat(80)
    expect(fitText(long, 20, 8, 20, 8, 1.4, "flag").fits).toBe(false)
    expect(fitText(long, 20, 8, 20, 8, 1.4, "truncate")).toMatchObject({
      fits: true,
      truncated: true,
    })
    expect(effectivePpi(3000, 2000, 254, 127)).toBe(300)
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
})
