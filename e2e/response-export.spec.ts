import { readFile } from "node:fs/promises"
import { unzipSync } from "fflate"
import { expect, test } from "@playwright/test"

test("Excel download stays available throughout collection and exports newly saved responses", async ({
  page,
  request,
}) => {
  const created = await request.post("/api/projects", {
    data: { title: "Excel export journey", bookLanguage: "en" },
  })
  expect(created.status()).toBe(201)
  const { id, formRevision } = await created.json()
  const path = `/api/projects/${id}`
  const download = async () => {
    const pending = page.waitForEvent("download")
    await page.getByRole("button", { name: "Export Excel" }).click()
    const file = await pending
    expect(file.suggestedFilename()).toBe(`responses-${id}.xlsx`)
    const entries = unzipSync(await readFile((await file.path())!))
    return new TextDecoder().decode(entries["xl/sharedStrings.xml"])
  }
  try {
    expect(
      (
        await request.patch(path, {
          data: {
            expectedRevision: formRevision,
            formSchema: {
              version: 1,
              questions: [{ id: "name", prompt: "Name", type: "single-line", required: true }],
            },
          },
        })
      ).status()
    ).toBe(200)
    await page.goto(`/projects/${id}?tab=responses`)
    expect(await download()).toContain("Name")
    const published = await request.post(`${path}/publish`)
    expect(published.status()).toBe(200)
    const share = new URL((await published.json()).shareUrl).pathname.split("/").at(-1)
    await page.reload()
    await expect(page.getByText("No responses yet")).toBeVisible()
    expect(
      (
        await request.post(`/api/share/${share}`, {
          multipart: {
            payload: JSON.stringify({
              idempotencyKey: crypto.randomUUID(),
              answers: { name: "New arrival" },
            }),
          },
        })
      ).status()
    ).toBe(201)
    // The list is still empty. The download must read the response that arrived after it loaded.
    expect(await download()).toContain("New arrival")
    expect((await request.post(`${path}/close`)).status()).toBe(200)
    const current = await (await request.get(`${path}?submissions=true`)).json()
    const submission = current.submissions[0]
    expect(
      (
        await request.patch(`${path}/submissions/${submission.id}`, {
          data: { expectedRevision: submission.revision, answers: { name: "Corrected answer" } },
        })
      ).status()
    ).toBe(200)
    await page.reload()
    expect(await download()).toContain("Corrected answer")
    expect((await request.post(`${path}/archive`)).status()).toBe(200)
    await page.reload()
    expect(await download()).toContain("Corrected answer")
  } finally {
    await request.delete(path)
  }
})
