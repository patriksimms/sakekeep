import { afterEach, describe, expect, it } from "vitest"
import { getLocale, overwriteGetLocale } from "#/paraglide/runtime.js"
import { paraglideMiddleware } from "#/paraglide/server.js"
import * as m from "#/paraglide/messages.js"
import { runtimeLocale } from "#/test/locale.ts"
import { problemMessage } from "#/domain/problem-message.ts"
import { localeSchema } from "./locale.ts"

afterEach(() => overwriteGetLocale(() => "en"))

describe("locale scopes", () => {
  it("uses cookie, preferred language, then German without changing URLs", async () => {
    overwriteGetLocale(runtimeLocale)
    for (const [headers, locale] of [
      [{}, "de"],
      [{ "Accept-Language": "fr-FR" }, "de"],
      [{ "Accept-Language": "en-US,en;q=0.9" }, "en"],
      [{ Cookie: "PARAGLIDE_LOCALE=de", "Accept-Language": "en-US" }, "de"],
      [{ Cookie: "PARAGLIDE_LOCALE=en", "Accept-Language": "de-DE" }, "en"],
    ] as const) {
      const response = await paraglideMiddleware(
        new Request("http://localhost/projects", { headers }),
        ({ request }) => {
          expect(new URL(request.url).pathname).toBe("/projects")
          return new Response(getLocale())
        }
      )
      expect(await response.text()).toBe(locale)
    }
  })

  it("isolates simultaneous SSR requests and explicitly scoped print messages", async () => {
    overwriteGetLocale(runtimeLocale)
    const values = await Promise.all(
      ["de", "en"].map((locale) =>
        paraglideMiddleware(
          new Request("http://localhost/projects", {
            headers: { Cookie: `PARAGLIDE_LOCALE=${locale}` },
          }),
          async () => {
            await Promise.resolve()
            return new Response(
              JSON.stringify([
                getLocale(),
                m.question({}, { locale: "en" }),
                m.little_note({}, { locale: "de" }),
              ])
            )
          }
        )
      )
    )
    expect(await values[0]!.json()).toEqual(["de", "Question", "Eine kleine Notiz"])
    expect(await values[1]!.json()).toEqual(["en", "Question", "Eine kleine Notiz"])
  })

  it("renders persisted problem facts in either organizer language", () => {
    const problem = {
      id: "p",
      pageId: "page",
      code: "image-low-resolution" as const,
      blocking: false,
      params: { name: "foto.jpg", ppi: 200 },
    }
    expect(problemMessage(problem, "de")).toContain("effektiv 200 PPI")
    expect(problemMessage(problem, "en")).toContain("200 effective PPI")
    expect(problem).not.toHaveProperty("message")
    expect(localeSchema.safeParse("fr").success).toBe(false)
    expect(m.response_count({ count: 1 }, { locale: "de" })).toBe("1 Beitrag")
    expect(m.response_count({ count: 2 }, { locale: "de" })).toBe("2 Beiträge")
  })
})
