import * as m from "#/paraglide/messages.js"
import { createIsomorphicFn } from "@tanstack/react-start"
import { type Locale } from "./locale.ts"
import { type FormSchema } from "#/domain/types.ts"

export type PublicState =
  | { status: "collecting"; bookLanguage: Locale; title: string; formSchema: FormSchema }
  | { status: "closed"; bookLanguage: Locale }
  | { status: "unknown" }

export const loadPublicProject = createIsomorphicFn()
  .server(async (token: string): Promise<PublicState> => {
    const { findPublicProject } = await import("#/server/repository.ts")
    const result = await findPublicProject(token)
    if (result.status !== "collecting") return result
    return {
      status: result.status,
      bookLanguage: result.bookLanguage,
      title: result.title,
      formSchema: result.formSchema,
    }
  })
  .client(async (token: string): Promise<PublicState> => {
    const response = await fetch(`/api/share/${encodeURIComponent(token)}`)
    if (!response.ok && response.status !== 404) throw new Error(m.load_form_failed())
    return response.json()
  })
