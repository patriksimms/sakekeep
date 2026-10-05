// @vitest-environment jsdom

import { unzipSync } from "fflate"
import { describe, expect, it } from "vitest"

import { completeForm, submissionFixture } from "#/test/fixtures.ts"
import { responseWorkbook } from "./response-export.ts"

async function readWorkbook(submissions = [submissionFixture("first", 1)]) {
  const files = unzipSync(
    await responseWorkbook({ formSchema: completeForm, submissions }, "https://sakekeep.example")
  )
  const parse = (path: string) =>
    new DOMParser().parseFromString(new TextDecoder().decode(files[path]), "text/xml")
  const strings = [...parse("xl/sharedStrings.xml").querySelectorAll("si")].map((entry) =>
    entry.textContent.replace(/_x([0-9a-f]{4})_/gi, (_, code: string) =>
      String.fromCharCode(parseInt(code, 16))
    )
  )
  const sheet = parse("xl/worksheets/sheet1.xml")
  const rows = [...sheet.querySelectorAll("row")].map((row) =>
    [...row.querySelectorAll("c")].map((cell) => {
      const value = cell.querySelector("v")?.textContent ?? ""
      return cell.getAttribute("t") === "s" ? strings[Number(value)] : value
    })
  )
  return { rows, sheet }
}

describe("response workbook", () => {
  it("exports question columns, literal answers, choice labels, and protected photo links in arrival order", async () => {
    const first = submissionFixture("first", 1)
    first.answers.name = '=HYPERLINK("https://evil.example", "Click")'
    first.answers.memory = "Grüße & <memories>\nSecond line"
    first.answers.traits = ["kind", "funny"]
    first.answers.photos = [
      {
        assetId: "photo-id",
        name: "Photo & friends.png",
        mimeType: "image/png",
        width: 20,
        height: 20,
        sizeBytes: 50,
      },
    ]
    const { rows, sheet } = await readWorkbook([first, submissionFixture("second", 2)])
    expect(rows).toEqual([
      [
        "Response",
        "Submitted at (UTC)",
        "Your name",
        "Website",
        "A memory",
        "How do you know us?",
        "Choose traits",
        "Photos",
      ],
      [
        "1",
        "2026-07-18T00:00:00.000Z",
        '=HYPERLINK("https://evil.example", "Click")',
        "",
        "Grüße & <memories>\nSecond line",
        "Friend",
        "Kind\nFunny",
        "Photo & friends.png\nhttps://sakekeep.example/api/assets/photo-id?variant=master",
      ],
      [
        "2",
        "2026-07-18T00:00:00.000Z",
        "Person 2",
        "",
        "A sufficiently short memory.",
        "Friend",
        "Kind",
        "",
      ],
    ])
    expect(sheet.querySelector("f")).toBeNull()
  })

  it("exports the question headers when no responses exist", async () => {
    const { rows } = await readWorkbook([])
    expect(rows).toEqual([
      [
        "Response",
        "Submitted at (UTC)",
        "Your name",
        "Website",
        "A memory",
        "How do you know us?",
        "Choose traits",
        "Photos",
      ],
    ])
  })

  it.each([
    "constructor",
    "__proto__",
    "toString",
    "hasOwnProperty",
    "_x0041_",
    "_x005F_x0041_",
    "A�B",
    "line\r\nnext",
  ])("preserves the literal answer %s in a valid workbook cell", async (answer) => {
    const submission = submissionFixture("first", 1)
    submission.answers.name = answer
    const { rows } = await readWorkbook([submission])
    expect(rows[1]?.[2]).toBe(answer)
  })
})
