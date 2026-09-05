import { problemMessage } from "./problem-message.ts"
import { describe, expect, it } from "vitest"

import {
  blockingProblems,
  deterministicLayoutAssignments,
  effectivePpi,
  generateBook,
  inspectStandalonePage,
  inspectSubmissionPage,
  invalidBookPages,
  pinCoverPages,
} from "./generation.ts"
import {
  completeForm,
  cycleSettings,
  layoutFixture,
  standaloneLayoutFixture,
  submissionFixture,
} from "../test/fixtures.ts"
import { addElement } from "./layout.ts"
import { type ImageAnswer, type LayoutRecord } from "./types.ts"

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
    const standaloneLayout = standaloneLayoutFixture()
    const layouts = [
      layoutFixture("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 0),
      layoutFixture("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", 1),
      standaloneLayout,
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
      id: "standalone:intro",
      kind: "standalone" as const,
      layoutId: standaloneLayout.id,
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

  it("pins the covers first and last and keeps them out of response assignment", () => {
    const submissions = submissionIds.slice(0, 2).map(submissionFixture)
    const response = layoutFixture("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 0)
    const front = standaloneLayoutFixture("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "front-cover", 1)
    const back = standaloneLayoutFixture("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "back-cover", 2)

    const book = generateBook({
      projectId: response.projectId,
      form: completeForm,
      submissions,
      // Deliberately out of order: the covers are pinned by role, not by position.
      layouts: [back, response, front],
      settings: cycleSettings,
      now: "2026-07-18T00:00:00.000Z",
    })

    expect(book.pages.map((page) => page.kind)).toEqual([
      "standalone",
      "submission",
      "submission",
      "standalone",
    ])
    expect(book.pages.at(0)).toMatchObject({ layoutId: front.id })
    expect(book.pages.at(-1)).toMatchObject({ layoutId: back.id })
    for (const page of book.pages) {
      if (page.kind === "submission") expect(page.layoutId).toBe(response.id)
    }
  })

  it("keeps the covers pinned when the book is regenerated after a reorder", () => {
    const submissions = submissionIds.slice(0, 2).map(submissionFixture)
    const response = layoutFixture("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 0)
    const front = standaloneLayoutFixture("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "front-cover", 1)
    const layouts = [response, front]
    const first = generateBook({
      projectId: response.projectId,
      form: completeForm,
      submissions,
      layouts,
      settings: cycleSettings,
      now: "2026-07-18T00:00:00.000Z",
    })

    const regenerated = generateBook({
      projectId: response.projectId,
      form: completeForm,
      submissions,
      layouts,
      settings: cycleSettings,
      previousBook: { ...first, pages: [...first.pages].reverse() },
      now: "2026-07-18T00:01:00.000Z",
    })

    expect(regenerated.pages[0]).toMatchObject({ kind: "standalone", layoutId: front.id })
  })

  it("drops a standalone page whose layout was deleted", () => {
    const response = layoutFixture("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 0)
    const standalone = standaloneLayoutFixture()
    const previousBook = generateBook({
      projectId: response.projectId,
      form: completeForm,
      submissions: [],
      layouts: [response, standalone],
      settings: cycleSettings,
      now: "2026-07-18T00:00:00.000Z",
    })
    const withPage = {
      ...previousBook,
      pages: [
        {
          id: "standalone:page",
          kind: "standalone" as const,
          layoutId: standalone.id,
          problems: [],
        },
      ],
    }

    expect(
      generateBook({
        projectId: response.projectId,
        form: completeForm,
        submissions: [],
        layouts: [response, standalone],
        settings: cycleSettings,
        previousBook: withPage,
        now: "2026-07-18T00:01:00.000Z",
      }).pages
    ).toHaveLength(1)
    expect(
      generateBook({
        projectId: response.projectId,
        form: completeForm,
        submissions: [],
        layouts: [response],
        settings: cycleSettings,
        previousBook: withPage,
        now: "2026-07-18T00:01:00.000Z",
      }).pages
    ).toEqual([])
  })

  it("refuses to generate responses without a response layout", () => {
    const front = standaloneLayoutFixture("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "front-cover", 0)

    expect(() =>
      generateBook({
        projectId: front.projectId,
        form: completeForm,
        submissions: [submissionFixture(submissionIds[0]!, 1)],
        layouts: [front],
        settings: cycleSettings,
      })
    ).toThrow(/response layout/)
  })

  it("reports overflowing text on a standalone page by its layout name", () => {
    const layout = standaloneLayoutFixture()
    layout.schema = {
      ...layout.schema,
      elements: layout.schema.elements.map((element) =>
        element.type === "static-text"
          ? {
              ...element,
              content: "A long note ".repeat(40),
              geometry: { ...element.geometry, height: 6 },
              text: { ...element.text, overflow: "flag" as const },
            }
          : element
      ),
    }

    const problems = inspectStandalonePage("standalone:page", layout)

    expect(problems.map((problem) => problem.code)).toContain("text-overflow")
    expect(
      problemMessage(
        problems.find((problem) => problem.code === "text-overflow")!,
        "en"
      )
    ).toContain(layout.name)
  })

  it("re-pins covers after the pages were rearranged", () => {
    const response = layoutFixture("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 0)
    const front = standaloneLayoutFixture("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "front-cover", 1)
    const back = standaloneLayoutFixture("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "back-cover", 2)
    const standalone = standaloneLayoutFixture("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "static", 3)
    const pages = [
      { id: "standalone:back", kind: "standalone" as const, layoutId: back.id, problems: [] },
      {
        id: "standalone:middle",
        kind: "standalone" as const,
        layoutId: standalone.id,
        problems: [],
      },
      { id: "standalone:front", kind: "standalone" as const, layoutId: front.id, problems: [] },
    ]

    expect(
      pinCoverPages(pages, [response, front, back, standalone]).map((page) => page.id)
    ).toEqual(["standalone:front", "standalone:middle", "standalone:back"])
  })

  describe("book page validation", () => {
    const response = layoutFixture("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 0)
    const front = standaloneLayoutFixture("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "front-cover", 1)
    const standalone = standaloneLayoutFixture("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "static", 2)
    const layouts = [response, front, standalone]
    const empty = new Set<string>()

    it("accepts a response page and a standalone page on their own layouts", () => {
      expect(
        invalidBookPages(
          [
            {
              id: "submission:1",
              kind: "submission",
              submissionId: submissionIds[0]!,
              layoutId: response.id,
              problems: [],
            },
            {
              id: "standalone:1",
              kind: "standalone",
              layoutId: standalone.id,
              problems: [],
            },
          ],
          layouts,
          empty
        )
      ).toEqual([])
    })

    it("rejects a standalone page placed on a response layout", () => {
      expect(
        invalidBookPages(
          [{ id: "standalone:1", kind: "standalone", layoutId: response.id, problems: [] }],
          layouts,
          empty
        )
      ).toEqual([{ pageId: "standalone:1", reason: "is a standalone page on a response layout" }])
    })

    it("rejects a response page assigned to a layout generation would never pick", () => {
      expect(
        invalidBookPages(
          [
            {
              id: "submission:1",
              kind: "submission",
              submissionId: submissionIds[0]!,
              layoutId: front.id,
              problems: [],
            },
          ],
          layouts,
          empty
        )
      ).toEqual([{ pageId: "submission:1", reason: "is a response page on a non-response layout" }])
    })

    it("rejects a duplicated cover page", () => {
      const issues = invalidBookPages(
        [
          { id: "standalone:a", kind: "standalone", layoutId: front.id, problems: [] },
          { id: "standalone:b", kind: "standalone", layoutId: front.id, problems: [] },
        ],
        layouts,
        empty
      )

      expect(issues).toEqual([{ pageId: "standalone:b", reason: "duplicates a cover page" }])
    })

    it("rejects a new page on a layout the project does not own", () => {
      expect(
        invalidBookPages(
          [
            {
              id: "standalone:new",
              kind: "standalone",
              layoutId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
              problems: [],
            },
          ],
          layouts,
          empty
        )
      ).toEqual([
        { pageId: "standalone:new", reason: "references a layout this project does not own" },
      ])
    })

    it("keeps a stored page whose layout was deleted, so a stale book stays editable", () => {
      expect(
        invalidBookPages(
          [
            {
              id: "submission:1",
              kind: "submission",
              submissionId: submissionIds[0]!,
              layoutId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
              problems: [],
            },
          ],
          layouts,
          new Set(["submission:1"])
        )
      ).toEqual([])
    })
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
  ] as const)(
    "describes %s overflow with its relevant constraint",
    (policy, blocking, _message) => {
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
          params: expect.objectContaining({
            name: "A memory",
            policy,
            requiredLines: 4,
            availableLines: policy === "shrink" ? 2 : 1,
          }),
        })
      )
    }
  )

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
        params: expect.objectContaining({
          name: "Best memory",
          location: 1,
          availableLines: 0,
          fontSize: 20,
          heightMm: 5,
        }),
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
        params: expect.objectContaining({
          name: "A memory",
          requiredLines: 2,
          availableLines: 1,
          fontSize: 20,
        }),
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

    expect(problems.map((problem) => problemMessage(problem, "en"))).toEqual([
      expect.stringContaining("A memory (text bounding box 1)"),
      expect.stringContaining("A memory (text bounding box 2)"),
    ])
    expect(new Set(problems.map((problem) => problemMessage(problem, "en")))).toHaveLength(2)
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

describe("photo distribution problems", () => {
  function photo(assetId: string, width = 3000, height = 2000): ImageAnswer {
    return {
      assetId,
      name: `${assetId}.jpg`,
      mimeType: "image/jpeg",
      width,
      height,
      sizeBytes: 1_000,
    }
  }

  function photoLayout(frames: Array<{ id: string; y: number }>): LayoutRecord {
    const layout = layoutFixture()
    layout.schema.elements = frames.map((frame) => ({
      id: frame.id,
      type: "image-frame" as const,
      questionId: "photos",
      cornerRadius: 0,
      opacity: 1,
      geometry: { x: 10, y: frame.y, width: 40, height: 27, rotation: 0 },
    }))
    return layout
  }

  it("warns once per question when frames stay empty", () => {
    const layout = photoLayout(
      [10, 40, 70, 100, 130].map((y, index) => ({ id: `frame-${index}`, y }))
    )
    const submission = submissionFixture(submissionIds[0]!, 3)
    submission.answers.photos = ["a", "b", "c", "d"].map((assetId) => photo(assetId))

    const problems = inspectSubmissionPage("page", layout, submission, completeForm, []).filter(
      (problem) => problem.code === "photo-slot-mismatch"
    )

    expect(problems).toEqual([
      expect.objectContaining({
        blocking: false,
        params: expect.objectContaining({
          prompt: "Photos",
          response: 3,
          slotCount: 5,
          photoCount: 4,
          emptySlotCount: 1,
        }),
      }),
    ])
  })

  it("warns about photos it cannot show without blocking the export", () => {
    const layout = photoLayout([10, 40, 70, 100].map((y, index) => ({ id: `frame-${index}`, y })))
    const submission = submissionFixture(submissionIds[0]!, 2)
    submission.answers.photos = ["a", "b", "c", "d", "e", "f"].map((assetId) => photo(assetId))

    const book = generateBook({
      projectId: layout.projectId,
      form: completeForm,
      submissions: [submission],
      layouts: [layout],
      settings: cycleSettings,
      now: "2026-07-18T00:00:00.000Z",
    })

    expect(
      book.pages[0]!.problems.filter((problem) => problem.code === "photo-slot-mismatch")
    ).toEqual([
      expect.objectContaining({
        blocking: false,
        params: expect.objectContaining({
          prompt: "Photos",
          response: 2,
          slotCount: 4,
          photoCount: 6,
          unplacedPhotoCount: 2,
        }),
      }),
    ])
    expect(blockingProblems(book)).toEqual([])
  })

  it("reports one problem per question with mismatched frames", () => {
    const layout = photoLayout([{ id: "photo-frame", y: 10 }])
    layout.schema.elements.push({
      id: "portrait-frame",
      type: "image-frame",
      questionId: "portraits",
      cornerRadius: 0,
      opacity: 1,
      geometry: { x: 60, y: 10, width: 40, height: 27, rotation: 0 },
    })
    const form = {
      ...completeForm,
      questions: [
        ...completeForm.questions,
        {
          id: "portraits",
          type: "images" as const,
          prompt: "Portraits",
          required: false,
          maxImages: 1,
        },
      ],
    }
    const submission = submissionFixture(submissionIds[0]!, 1)
    submission.answers.photos = [photo("a"), photo("b")]
    submission.answers.portraits = []

    const problems = inspectSubmissionPage("page", layout, submission, form, []).filter(
      (problem) => problem.code === "photo-slot-mismatch"
    )

    expect(problems.map((problem) => problemMessage(problem, "en"))).toEqual([
      expect.stringContaining('"Photos": 1 photos are not shown'),
      expect.stringContaining('"Portraits": 0 photos are not shown and 1 slots stay empty'),
    ])
    expect(new Set(problems.map((problem) => problem.id))).toHaveLength(2)
  })

  it("checks effective resolution against the frame each photo is assigned to", () => {
    const layout = photoLayout([
      { id: "small-frame", y: 10 },
      { id: "large-frame", y: 60 },
    ])
    layout.schema.elements[0]!.geometry = { x: 10, y: 10, width: 20, height: 14, rotation: 0 }
    layout.schema.elements[1]!.geometry = { x: 10, y: 60, width: 180, height: 80, rotation: 0 }
    const submission = submissionFixture(submissionIds[0]!, 1)
    submission.answers.photos = [photo("sharp", 3000, 2000), photo("soft", 400, 300)]

    const problems = inspectSubmissionPage("page", layout, submission, completeForm, []).filter(
      (problem) => problem.code === "image-blocking-resolution"
    )

    expect(problems).toEqual([
      expect.objectContaining({ assetId: "soft", elementId: "large-frame", blocking: true }),
    ])
  })
})
