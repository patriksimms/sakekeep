import { expect, test } from "@playwright/test"
import type { Project } from "../src/domain/types.ts"

const id = "11111111-1111-4111-8111-111111111111"
const api = `/api/projects/${id}`

test("empty slots retain artwork, blank and layout defaults through saves and regeneration", async ({
  page,
  request,
}) => {
  const getProject = async () =>
    (await (await request.get(`${api}?submissions=true`)).json()) as Project
  const original = await getProject()
  const layout = original.layouts[0]!
  const schema = structuredClone(layout.schema)
  schema.elements.push({
    id: "choice-gallery",
    type: "gallery-frame",
    questionId: "photos",
    geometry: { x: 20, y: 90, width: 170, height: 40, rotation: 0 },
    opacity: 1,
    arrangement: "three-column",
    gap: 4,
  })
  const saveLayout = async () => {
    const current = (await getProject()).layouts.find((item) => item.id === layout.id)!
    const response = await request.patch(`${api}/layouts/${layout.id}`, {
      data: { expectedRevision: current.revision, schema },
    })
    expect(response.ok()).toBe(true)
  }
  try {
    await saveLayout()
    await page.goto(`/projects/${id}?tab=book`)
    await expect(page.getByRole("combobox", { name: "Assignment mode" })).toBeEnabled()
    await page.getByRole("button", { name: "Single page", exact: true }).click()
    const slot = (index: number) => page.locator(`[data-empty-art-slot="choice-gallery:${index}"]`)
    const ready = () => expect(slot(0)).toBeVisible()
    await ready()
    const originalMotif = await slot(0).locator("svg").getAttribute("data-filler-motif")
    await slot(0).click()
    await expect(page.getByRole("button", { name: /^Artwork \d$/ })).toHaveCount(9)
    await page.getByRole("button", { name: "Blank", exact: true }).click()
    await ready()
    await expect(slot(0).locator("svg")).toHaveCount(0)
    await expect(slot(1).locator("svg")).toHaveCount(1)
    await slot(1).click()
    await page.getByRole("button", { name: "Artwork 1", exact: true }).click()
    await ready()
    await expect(slot(1).locator("svg")).toHaveAttribute("data-filler-motif", "single-bloom")
    await page.reload()
    await ready()
    await expect(slot(0).locator("svg")).toHaveCount(0)
    await expect(slot(1).locator("svg")).toHaveAttribute("data-filler-motif", "single-bloom")
    const persisted = (await getProject()).book!.pages[0]!.emptySlotArt
    expect(persisted).toEqual({ "choice-gallery": { 0: "blank", 1: "single-bloom" } })

    await page.getByRole("tab", { name: "3. Layouts" }).click()
    await page.getByRole("button", { name: "Add one or two favourite photos", exact: true }).click()
    const fillSwitch = page.getByRole("switch", { name: "Fill empty slots with art" })
    await expect(fillSwitch).toBeChecked()
    await fillSwitch.click()
    await page.getByRole("tab", { name: "4. Book review" }).click()
    await ready()
    await expect(slot(0).locator("svg")).toHaveCount(0)
    await expect(slot(1).locator("svg")).toHaveAttribute("data-filler-motif", "single-bloom")
    await expect(slot(2).locator("svg")).toHaveCount(0)
    await slot(1).click()
    await page.getByRole("button", { name: "Use layout default", exact: true }).click()
    await ready()
    await expect(slot(1).locator("svg")).toHaveCount(0)
    await slot(1).click()
    await page.getByRole("button", { name: "Artwork 2", exact: true }).click()
    await ready()
    await expect(slot(1).locator("svg")).toHaveAttribute("data-filler-motif", "leaf-pair")

    // A failed save leaves the previous choice visible, and retry can succeed.
    await page.route(`**${api}/book`, async (route) => {
      if (route.request().method() === "PATCH")
        return route.fulfill({ status: 503, json: { error: "Artwork save unavailable" } })
      return route.continue()
    })
    await slot(1).click()
    await page.getByRole("button", { name: "Blank", exact: true }).click()
    await expect(page.getByText("Artwork save unavailable")).toBeVisible()
    await ready()
    await expect(slot(1).locator("svg")).toHaveAttribute("data-filler-motif", "leaf-pair")
    await page.unroute(`**${api}/book`)
    await slot(1).click()
    await page.getByRole("button", { name: "Blank", exact: true }).click()
    await ready()
    await expect(slot(1).locator("svg")).toHaveCount(0)

    await page.getByRole("tab", { name: "3. Layouts" }).click()
    await page.getByRole("button", { name: "Add one or two favourite photos", exact: true }).click()
    await fillSwitch.click()
    await page.getByRole("tab", { name: "4. Book review" }).click()
    await ready()
    await slot(0).click()
    await page.getByRole("button", { name: "Use layout default", exact: true }).click()
    await ready()
    await expect(slot(0).locator("svg")).toHaveAttribute("data-filler-motif", originalMotif!)
    await expect(slot(1).locator("svg")).toHaveCount(0)
    expect((await getProject()).book!.pages[2]!.emptySlotArt).toBeUndefined()
  } finally {
    const latest = (await getProject()).layouts.find((item) => item.id === layout.id)!
    await request.patch(`${api}/layouts/${layout.id}`, {
      data: { expectedRevision: latest.revision, schema: layout.schema },
    })
    await request.post(`${api}/book`, { data: original.book!.settings })
  }
})
