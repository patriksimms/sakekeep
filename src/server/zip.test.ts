import { unzipSync } from "fflate"
import { describe, expect, it } from "vitest"

import { createZip, pageEntryName } from "./zip.ts"

describe("export bundles", () => {
  it("keeps every entry byte-identical", () => {
    const first = new Uint8Array([37, 80, 68, 70])
    const second = new Uint8Array([255, 216, 255, 224, 0])
    const unzipped = unzipSync(
      createZip([
        { name: "page-01.pdf", data: first },
        { name: "page-02.pdf", data: second },
      ])
    )

    expect(Object.keys(unzipped)).toEqual(["page-01.pdf", "page-02.pdf"])
    expect(unzipped["page-01.pdf"]).toEqual(first)
    expect(unzipped["page-02.pdf"]).toEqual(second)
  })

  it("names entries in book order and pads to the book length", () => {
    expect(pageEntryName(0, 9, "pdf")).toBe("page-01.pdf")
    expect(pageEntryName(9, 10, "jpg")).toBe("page-10.jpg")
    expect(pageEntryName(0, 120, "jpg")).toBe("page-001.jpg")
  })
})
