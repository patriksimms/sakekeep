import { z } from "zod"

const storageKey = "sakekeep-pending-invitations"
const schema = z.array(
  z.object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    dismissed: z.boolean(),
  })
)
export type PendingInvitation = z.infer<typeof schema>[number]

export function readPendingInvitations(): PendingInvitation[] {
  try {
    const result = schema.safeParse(JSON.parse(window.localStorage.getItem(storageKey) ?? "[]"))
    return result.success ? result.data : []
  } catch {
    return []
  }
}

export function rememberInvitation(token: string) {
  const entries = readPendingInvitations()
  // Revisiting a dismissed link does not reopen its modal.
  if (!entries.some((entry) => entry.token === token)) {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify([...entries, { token, dismissed: false }])
    )
  }
}

export function setInvitationDismissed(token: string, dismissed: boolean) {
  window.localStorage.setItem(
    storageKey,
    JSON.stringify(
      readPendingInvitations().map((entry) =>
        entry.token === token ? { ...entry, dismissed } : entry
      )
    )
  )
}

export function forgetInvitation(token: string) {
  window.localStorage.setItem(
    storageKey,
    JSON.stringify(readPendingInvitations().filter((entry) => entry.token !== token))
  )
}
