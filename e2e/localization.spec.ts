import { expect, test } from "@playwright/test"

test("organizer preference persists while contributor language follows its book", async ({
  page,
  request,
  context,
}) => {
  await page.goto("/projects")
  await expect(page.getByText("Lea’s farewell book")).toBeVisible()
  await page.getByTestId("language-switcher").click()
  await page.getByTestId("language-de").click()
  await expect(page.locator("html")).toHaveAttribute("lang", "de")
  await page.reload()
  await expect(page.getByText("Lea’s farewell book")).toBeVisible()
  await expect(page.getByTestId("heading-your-projects")).toHaveText("Deine Projekte")
  await page.getByTestId("button-new-project").click()
  await expect(page.getByTestId("book-language")).toContainText("Deutsch")
  await page.getByTestId("book-language").click()
  await page.getByTestId("book-language-en").click()
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("heading-create-a-friend-book")).toHaveCount(0)
  await page.getByTestId("button-new-project").click()
  await expect(page.getByTestId("book-language")).toContainText("Deutsch")
  await page.getByTestId("project-title").fill("Deutsches Erinnerungsbuch")
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/projects") && r.request().method() === "POST"
  )
  await page.getByTestId("button-create-project").click()
  const project = await (await response).json()
  expect(project.bookLanguage).toBe("de")
  try {
    expect(
      (
        await request.patch(`/api/projects/${project.id}`, {
          data: {
            formSchema: {
              version: 1,
              questions: [
                { id: "memory", type: "multiline", prompt: "Deine Erinnerung", required: true },
              ],
            },
            expectedRevision: 0,
          },
        })
      ).ok()
    ).toBe(true)
    await expect(page.getByTestId("workspace-form")).toBeVisible()
    const published = await (await request.post(`/api/projects/${project.id}/publish`)).json()
    await page.getByTestId("language-switcher").click()
    await page.getByTestId("language-en").click()
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    const contributor = await context.newPage()
    await contributor.goto(new URL(published.shareUrl).pathname)
    await expect(contributor.locator("html")).toHaveAttribute("lang", "de")
    await expect(contributor.getByTestId("language-switcher")).toHaveCount(0)
    await expect(contributor.getByTestId("submit-contribution")).toHaveText("Einmalig absenden")
    await contributor
      .getByTestId("answer-memory")
      .fill("Unsere Geburtstagserinnerungen bleiben erhalten.")
    await contributor.getByTestId("contribution-consent").check()
    await contributor.getByTestId("submit-contribution").click()
    await expect(contributor.getByText("Dein Beitrag wurde abgeschickt.")).toBeVisible()
    await contributor.close()
    await page.goto("/projects")
    await expect(page.getByText("Lea’s farewell book")).toBeVisible()
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    expect(
      (await context.cookies()).find((cookie) => cookie.name === "PARAGLIDE_LOCALE")?.value
    ).toBe("en")
  } finally {
    await request.delete(`/api/projects/${project.id}`)
  }
})

test("submission edit validation follows each request locale", async ({ request }) => {
  for (const locale of ["en", "de", "en"]) {
    const response = await request.patch(
      "/api/projects/11111111-1111-4111-8111-111111111111/submissions/00000000-0000-4000-8000-000000000000",
      {
        headers: { Cookie: `PARAGLIDE_LOCALE=${locale}` },
        data: { expectedRevision: 0, answers: {} },
      }
    )
    expect(response.status()).toBe(422)
    expect((await response.json()).details.issues).toEqual([
      {
        path: "answers",
        message:
          locale === "de"
            ? "Ändere mindestens eine Textantwort."
            : "Change at least one text answer.",
      },
    ])
  }
})
