import { unzipSync } from "fflate"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { type Project } from "#/domain/types.ts"
import { completeForm, cycleSettings, layoutFixture, submissionFixture } from "#/test/fixtures.ts"

const getProject = vi.fn()
const recordExport = vi.fn()
const putObject = vi.fn()

vi.mock("./repository.ts", () => ({
  getProject: (...args: unknown[]) => getProject(...args),
  recordExport: (...args: unknown[]) => recordExport(...args),
  getAsset: vi.fn(),
}))

vi.mock("./object-store.ts", () => ({
  putObject: (...args: unknown[]) => putObject(...args),
  getObject: vi.fn(),
}))

const { exportProject } = await import("./export-service.ts")

function cleanProject(): Project {
  const project = currentProject()
  const book = project.book!
  return {
    ...project,
    book: { ...book, pages: book.pages.map((page) => ({ ...page, problems: [] })) },
  }
}

function storedObject(key: string): Uint8Array | undefined {
  const call = putObject.mock.calls.find(([input]) => (input as { key: string }).key.endsWith(key))
  return call ? (call[0] as { body: Uint8Array }).body : undefined
}

function currentProject(): Project {
  const layout = layoutFixture()
  const submission = submissionFixture("10000000-0000-4000-8000-000000000001", 1)

  return {
    id: layout.projectId,
    title: "Test book",
    occasion: null,
    state: "closed",
    formSchema: completeForm,
    layouts: [layout],
    submissions: [submission],
    bookStatus: "current",
    archivedAt: null,
    book: {
      projectId: layout.projectId,
      settings: cycleSettings,
      pages: [
        {
          id: `submission:${submission.id}`,
          kind: "submission",
          submissionId: submission.id,
          layoutId: layout.id,
          problems: [
            {
              id: "new-book-problem",
              code: "outside-print-area",
              pageId: `submission:${submission.id}`,
              elementId: "text",
              message: "Text is outside the safe area.",
              blocking: true,
            },
          ],
        },
      ],
      sourceFingerprint: "new-book",
      generatedAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:00.000Z",
    },
  } as Project
}

describe("export page bundles", () => {
  beforeEach(() => {
    putObject.mockReset()
    putObject.mockResolvedValue(undefined)
    recordExport.mockReset()
    recordExport.mockResolvedValue("55555555-5555-4555-8555-555555555555")
    getProject.mockResolvedValue(cleanProject())
  })

  it("stores every format for a single export", async () => {
    const artifact = await exportProject("99999999-9999-4999-8999-999999999999", {
      marks: false,
      allowBlockingProblems: false,
      reviewedBookFingerprint: null,
    })

    expect(
      putObject.mock.calls.map(([input]) => (input as { contentType: string }).contentType)
    ).toEqual([
      "application/pdf",
      "text/plain; charset=utf-8",
      "application/zip",
      "application/zip",
    ])
    expect(recordExport).toHaveBeenCalledWith(
      expect.objectContaining({
        pagePdfZipObjectKey: expect.stringContaining("sakekeep-pages-pdf.zip"),
        pageJpegZipObjectKey: expect.stringContaining("sakekeep-pages-jpeg.zip"),
      })
    )
    expect(artifact.pdfUrl).toBe(`/api/exports/${artifact.id}?file=pdf`)
    expect(artifact.reportUrl).toBe(`/api/exports/${artifact.id}?file=report`)
  })

  it("stores one entry per book page in each bundle", async () => {
    const pageCount = cleanProject().book!.pages.length
    const artifact = await exportProject("99999999-9999-4999-8999-999999999999", {
      marks: false,
      allowBlockingProblems: false,
      reviewedBookFingerprint: null,
    })

    expect(artifact.pagePdfZipUrl).toBe(`/api/exports/${artifact.id}?file=page-pdfs`)
    expect(artifact.pageJpegZipUrl).toBe(`/api/exports/${artifact.id}?file=page-jpegs`)

    const pdfEntries = unzipSync(storedObject("sakekeep-pages-pdf.zip")!)
    const jpegEntries = unzipSync(storedObject("sakekeep-pages-jpeg.zip")!)
    expect(Object.keys(pdfEntries)).toEqual(
      Array.from({ length: pageCount }, (_, index) => `page-0${index + 1}.pdf`)
    )
    expect(Object.keys(jpegEntries)).toEqual(
      Array.from({ length: pageCount }, (_, index) => `page-0${index + 1}.jpg`)
    )
    // Each entry has to be a real file of its declared kind, not an empty placeholder.
    for (const entry of Object.values(pdfEntries)) {
      expect(Buffer.from(entry.slice(0, 5)).toString("latin1")).toBe("%PDF-")
    }
    for (const entry of Object.values(jpegEntries)) {
      expect(Array.from(entry.slice(0, 3))).toEqual([0xff, 0xd8, 0xff])
    }
  })
})

describe("export blocking problem override", () => {
  it("rejects an override accepted for a different generated book", async () => {
    getProject.mockResolvedValue(currentProject())

    await expect(
      exportProject("99999999-9999-4999-8999-999999999999", {
        marks: false,
        allowBlockingProblems: true,
        reviewedBookFingerprint: "reviewed-book",
      })
    ).rejects.toMatchObject({
      status: 409,
      message:
        "The book changed after you accepted its problems. Review it again before exporting.",
    })
  })
})
