// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { PendingInvitationList } from "./pending-invitations"
import { rememberInvitation, readPendingInvitations } from "#/lib/pending-invitations"

const token = "a".repeat(43)
const switchAccount = vi.fn(async () => {})
beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    clear: () => values.clear(),
  })
})
afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  switchAccount.mockClear()
})
function mount(account = "relay@privaterelay.appleid.com") {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <PendingInvitationList account={account} switchAccount={switchAccount} />
    </QueryClientProvider>
  )
}
function previewResponse() {
  return Response.json({
    title: "Farewell book",
    role: "editor",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  })
}
it("keeps invitations through authentication, dismissal, navigation, and reload without accepting", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => previewResponse())
  rememberInvitation(token)
  let view = mount()
  const dialog = await screen.findByRole("dialog")
  expect(await within(dialog).findByText("Farewell book · Editor")).toBeTruthy()
  expect(within(dialog).getByText("Signed in as relay@privaterelay.appleid.com")).toBeTruthy()
  expect(fetch.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true)
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  view.unmount()
  rememberInvitation(token)
  view = mount()
  await screen.findByRole("button", { name: "Join project" })
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(readPendingInvitations()).toEqual([{ token, dismissed: true }])
  fireEvent.click(screen.getByRole("button", { name: "Join project" }))
  expect(await screen.findByRole("dialog")).toBeTruthy()
  view.unmount()
})
it("preserves the invitation when switching accounts and confirms only on the join action", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_, init) =>
      init?.method === "POST"
        ? Response.json({ error: "This invitation has expired or been revoked." }, { status: 410 })
        : previewResponse()
    )
  rememberInvitation(token)
  const view = mount()
  let dialog = await screen.findByRole("dialog")
  fireEvent.click(within(dialog).getByRole("button", { name: "Switch accounts" }))
  await waitFor(() => expect(switchAccount).toHaveBeenCalledOnce())
  expect(readPendingInvitations()[0]?.token).toBe(token)
  view.unmount()
  mount("chosen@example.com")
  dialog = await screen.findByRole("dialog")
  await within(dialog).findByText("Farewell book · Editor")
  expect(within(dialog).getByText("Signed in as chosen@example.com")).toBeTruthy()
  fireEvent.click(within(dialog).getByRole("button", { name: "Join project" }))
  await within(dialog).findByRole("alert")
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1)
  expect(within(dialog).queryByRole("button", { name: "Join project" })).toBeNull()
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }))
  await waitFor(() => expect(readPendingInvitations()).toEqual([]))
})
