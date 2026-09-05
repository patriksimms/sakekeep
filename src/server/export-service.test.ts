import { unzipSync } from "fflate"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { type Project } from "#/domain/types.ts"
import { completeForm, cycleSettings, layoutFixture, submissionFixture } from "#/test/fixtures.ts"

const getProject = vi.fn()
const recordExport = vi.fn()
const reserveObjects = vi.fn()
const putObject = vi.fn()
const putObjectStream = vi.fn()
const calls: string[] = []

vi.mock("./repository.ts", () => ({
  getProject: (...args: unknown[]) => getProject(...args),
  recordExport: (...args: unknown[]) => recordExport(...args),
  reserveObjects: (...args: unknown[]) => reserveObjects(...args),
  getAsset: vi.fn(),
}))

vi.mock("./object-store.ts", () => ({
  putObject: (...args: unknown[]) => putObject(...args),
  putObjectStream: (...args: unknown[]) => putObjectStream(...args),
  getObject: vi.fn(),
}))

const { exportProject } = await import("./export-service.ts")

async function collect(body: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  for await (const chunk of body) chunks.push(chunk)
  return Buffer.concat(chunks)
}

function cleanProject(): Project {
  const project = currentProject()
  const book = project.book!
  return {
    ...project,
    book: { ...book, pages: book.pages.map((page) => ({ ...page, problems: [] })) },
  }
}

/** The bytes a streamed upload actually wrote, reassembled the way the bucket sees them. */
const streamedObjects = new Map<string, Uint8Array>()

function currentProject(): Project {
  const layout = layoutFixture()
  const submission = submissionFixture("10000000-0000-4000-8000-000000000001", 1)

  return {
    id: layout.projectId,
    title: "Test book",
    occasion: null,
    bookLanguage: "en",
    formRevision: 1,
    shareUrl: null,
    submissionCount: 1,
    pageFormat: "a5",
    pageOrientation: "landscape",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
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
              params: { boundary: "safe" },
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
    calls.length = 0
    streamedObjects.clear()
    putObject.mockReset()
    putObject.mockImplementation((input: { key: string; contentType: string }) => {
      calls.push(`put:${input.contentType}`)
      return Promise.resolve()
    })
    putObjectStream.mockReset()
    putObjectStream.mockImplementation(
      async (input: { key: string; body: AsyncIterable<Uint8Array>; contentType: string }) => {
        calls.push(`stream:${input.contentType}`)
        streamedObjects.set(input.key, await collect(input.body))
      }
    )
    reserveObjects.mockReset()
    reserveObjects.mockImplementation((keys: string[]) => {
      calls.push(`reserve:${keys.length}`)
      return Promise.resolve()
    })
    recordExport.mockReset()
    recordExport.mockImplementation(() => {
      calls.push("record")
      return Promise.resolve("55555555-5555-4555-8555-555555555555")
    })
    getProject.mockResolvedValue(cleanProject())
  })

  it("stores every format for a single export", async () => {
    const artifact = await exportProject("99999999-9999-4999-8999-999999999999", {
      marks: false,
      allowBlockingProblems: false,
      reviewedBookFingerprint: null,
    })

    expect(calls).toEqual([
      "reserve:4",
      "put:application/pdf",
      "put:text/plain; charset=utf-8",
      "stream:application/zip",
      "stream:application/zip",
      "record",
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

  it("claims every object key before the first byte is written", async () => {
    await exportProject("99999999-9999-4999-8999-999999999999", {
      marks: false,
      allowBlockingProblems: false,
      reviewedBookFingerprint: null,
    })

    const [reserved] = reserveObjects.mock.calls[0] as [string[]]
    const written = [
      ...putObject.mock.calls.map(([input]) => (input as { key: string }).key),
      ...streamedObjects.keys(),
    ]
    expect([...reserved].sort()).toEqual([...written].sort())
    expect(calls.indexOf("reserve:4")).toBe(0)
  })

  it("leaves the uploaded objects claimed when the export row cannot be written", async () => {
    recordExport.mockRejectedValue(new Error("insert failed"))

    await expect(
      exportProject("99999999-9999-4999-8999-999999999999", {
        marks: false,
        allowBlockingProblems: false,
        reviewedBookFingerprint: null,
      })
    ).rejects.toThrow("insert failed")
    // The reservation was never handed over, so the sweep still owns these objects.
    expect(reserveObjects).toHaveBeenCalledTimes(1)
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

    const stored = (suffix: string) =>
      [...streamedObjects].find(([key]) => key.endsWith(suffix))?.[1]
    const pdfEntries = unzipSync(stored("sakekeep-pages-pdf.zip")!)
    const jpegEntries = unzipSync(stored("sakekeep-pages-jpeg.zip")!)
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
