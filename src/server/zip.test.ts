import { unzipSync } from "fflate"
import { describe, expect, it } from "vitest"

import { pageEntryName, zipEntries, type ZipEntry } from "./zip.ts"

async function* asStream(entries: ZipEntry[]): AsyncGenerator<ZipEntry> {
  for (const entry of entries) yield entry
}

async function archive(entries: ZipEntry[]): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  for await (const chunk of zipEntries(asStream(entries))) chunks.push(chunk)
  return Buffer.concat(chunks)
}

describe("export bundles", () => {
  it("keeps every entry byte-identical", async () => {
    const first = new Uint8Array([37, 80, 68, 70])
    const second = new Uint8Array([255, 216, 255, 224, 0])
    const unzipped = unzipSync(
      await archive([
        { name: "page-01.pdf", data: first },
        { name: "page-02.pdf", data: second },
      ])
    )

    expect(Object.keys(unzipped)).toEqual(["page-01.pdf", "page-02.pdf"])
    expect(unzipped["page-01.pdf"]).toEqual(first)
    expect(unzipped["page-02.pdf"]).toEqual(second)
  })

  it("pulls one entry at a time instead of collecting them first", async () => {
    const produced: string[] = []
    async function* pages(): AsyncGenerator<ZipEntry> {
      for (const name of ["page-01.pdf", "page-02.pdf", "page-03.pdf"]) {
        produced.push(name)
        yield { name, data: new Uint8Array([37, 80, 68, 70]) }
      }
    }

    const chunks: Uint8Array[] = []
    const archived = zipEntries(pages())
    // The first entry has to reach the consumer before the third one is ever produced.
    const first = await archived.next()
    chunks.push(first.value!)
    expect(produced).toEqual(["page-01.pdf"])

    for await (const chunk of archived) chunks.push(chunk)
    expect(Object.keys(unzipSync(Buffer.concat(chunks)))).toEqual([
      "page-01.pdf",
      "page-02.pdf",
      "page-03.pdf",
    ])
  })

  it("names entries in book order and pads to the book length", () => {
    expect(pageEntryName(0, 9, "pdf")).toBe("page-01.pdf")
    expect(pageEntryName(9, 10, "jpg")).toBe("page-10.jpg")
    expect(pageEntryName(0, 120, "jpg")).toBe("page-001.jpg")
  })
})
