import { expect, test } from "@playwright/test"

test.use({ colorScheme: "dark", viewport: { width: 1440, height: 1000 } })

const projectId = "11111111-1111-4111-8111-111111111111"

for (const { tab, module, readyRole, readyName } of [
  { tab: "layouts", module: "layout-editor", readyRole: "textbox", readyName: "Layout name" },
  { tab: "book", module: "book-review", readyRole: "combobox", readyName: "Assignment mode" },
] as const) {
  test(`${tab} recovers from a failed download by reloading the page`, async ({ page }) => {
    const moduleUrl = `**/src/components/${module}.tsx*`
    await page.route(moduleUrl, (route) => route.abort("failed"))
    await page.goto(`/projects/${projectId}?tab=${tab}`)
    await expect(page.getByRole("alert")).toContainText("This tool could not load.")

    // A broken tool must not take the rest of the workspace down with it.
    await page.getByTestId("workspace-form").click()
    await expect(page.getByRole("heading", { name: "Published form" })).toBeVisible()
    await page.getByTestId(`workspace-${tab}`).click()
    await expect(page.getByRole("button", { name: "Reload page" })).toBeVisible()

    await page.unroute(moduleUrl)
    await page.getByRole("button", { name: "Reload page" }).click()
    await expect(page.getByRole(readyRole, { name: readyName, exact: true })).toBeVisible()
  })
}

test("form and responses defer tools, with loading feedback on each first visit", async ({
  page,
}) => {
  const requests: string[] = []
  const releases: Array<() => void> = []
  // Hold the actual tool modules to expose the loading state on the local Vite server.
  for (const tool of ["layout-editor", "book-review"]) {
    const held = new Promise<void>((resolve) => releases.push(resolve))
    await page.route(`**/src/components/${tool}.tsx*`, async (route) => {
      requests.push(tool)
      await held
      await route.continue()
    })
  }
  try {
    await page.goto(`/projects/${projectId}?tab=form`)
    await expect(page.getByRole("heading", { name: "Published form" })).toBeVisible({
      timeout: 20_000,
    })
    expect(requests).toEqual([])
    await page.getByTestId("workspace-responses").click()
    await expect(page.getByRole("tabpanel", { name: "2. Responses" })).toBeVisible()
    expect(requests).toEqual([])

    await page.getByTestId("workspace-layouts").click()
    await expect(page.getByRole("status")).toHaveText("Loading layouts…")
    await page.screenshot({ path: "visual-artifacts/issues/121/loading-layouts.png" })
    await expect.poll(() => requests).toEqual(["layout-editor"])
    releases[0]!()
    await expect(page.getByRole("textbox", { name: "Layout name", exact: true })).toBeVisible()

    await page.getByTestId("workspace-book").click()
    await expect(page.getByRole("status")).toHaveText("Loading book review…")
    await page.screenshot({ path: "visual-artifacts/issues/121/loading-book.png" })
    await expect.poll(() => requests).toEqual(["layout-editor", "book-review"])
    releases[1]!()
    await expect(page.getByRole("combobox", { name: "Assignment mode" })).toBeVisible()

    await page.getByTestId("workspace-layouts").click()
    await expect(page.getByRole("textbox", { name: "Layout name", exact: true })).toBeVisible()
    expect(requests).toEqual(["layout-editor", "book-review"])
  } finally {
    releases.forEach((release) => release())
    await page.unrouteAll({ behavior: "wait" })
  }
})
