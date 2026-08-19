import { describe, expect, it, vi } from "vitest"

import { completeForm, cycleSettings, layoutFixture, submissionFixture } from "../test/fixtures.ts"

vi.mock("./repository.ts", () => ({
  getAsset: vi.fn(async () => ({
    mimeType: "image/png",
    objectKey: "test/master.png",
  })),
}))

vi.mock("./object-store.ts", () => ({
  getObject: vi.fn(async () => ({
    body: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XxFvWQAAAABJRU5ErkJggg==",
      "base64"
    ),
    contentType: "image/png",
  })),
}))

describe("PDF raster metadata", () => {
  it("records and independently inspects effective-resolution metadata for placed assets", async () => {
    const { inspectPdf, renderBookPdf } = await import("./pdf-renderer.ts")
    const layout = layoutFixture()
    layout.schema.elements = [
      {
        id: "photo-frame",
        type: "image-frame",
        locked: false,
        opacity: 1,
        geometry: { x: 12, y: 12, width: 80, height: 60, rotation: 0 },
        questionId: "photos",
        cornerRadius: 0,
      },
    ]
    const submission = submissionFixture("10000000-0000-4000-8000-000000000001", 1)
    submission.answers.photos = [
      {
        assetId: "asset-print",
        name: "print.png",
        mimeType: "image/png",
        width: 1,
        height: 1,
        sizeBytes: 100,
      },
    ]
    const book = {
      projectId: layout.projectId,
      settings: cycleSettings,
      pages: [
        {
          id: `submission:${submission.id}`,
          kind: "submission" as const,
          submissionId: submission.id,
          layoutId: layout.id,
          problems: [],
        },
      ],
      sourceFingerprint: "image-test",
      generatedAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z",
    }

    const bytes = await renderBookPdf({
      book,
      layouts: [layout],
      submissions: [submission],
      form: completeForm,
      marks: false,
    })

    expect(await inspectPdf(bytes)).toMatchObject({
      assetResolutionMetadata: true,
      assetResolutionCount: 1,
    })
  })
})

describe("PDF photo distribution", () => {
  it("places a different photo in every frame bound to one question", async () => {
    const { inspectPdf, renderBookPdf } = await import("./pdf-renderer.ts")
    const layout = layoutFixture()
    layout.schema.elements = [
      {
        id: "lower-frame",
        type: "image-frame",
        opacity: 1,
        geometry: { x: 12, y: 80, width: 80, height: 60, rotation: 0 },
        questionId: "photos",
        cornerRadius: 0,
      },
      {
        id: "upper-frame",
        type: "image-frame",
        opacity: 1,
        geometry: { x: 12, y: 12, width: 80, height: 60, rotation: 0 },
        questionId: "photos",
        cornerRadius: 0,
      },
    ]
    const submission = submissionFixture("10000000-0000-4000-8000-000000000001", 1)
    submission.answers.photos = ["first", "second"].map((assetId) => ({
      assetId,
      name: `${assetId}.png`,
      mimeType: "image/png",
      width: 1,
      height: 1,
      sizeBytes: 100,
    }))

    const bytes = await renderBookPdf({
      book: {
        projectId: layout.projectId,
        settings: cycleSettings,
        pages: [
          {
            id: `submission:${submission.id}`,
            kind: "submission" as const,
            submissionId: submission.id,
            layoutId: layout.id,
            problems: [],
          },
        ],
        sourceFingerprint: "distribution-test",
        generatedAt: "2026-07-18T00:00:00.000Z",
        updatedAt: "2026-07-18T00:00:00.000Z",
      },
      layouts: [layout],
      submissions: [submission],
      form: completeForm,
      marks: false,
    })

    // Reading order, not element order: the upper frame prints the first uploaded photo.
    expect((await inspectPdf(bytes)).assetPlacements).toEqual([
      { assetId: "second", elementId: "lower-frame" },
      { assetId: "first", elementId: "upper-frame" },
    ])
  })
})
