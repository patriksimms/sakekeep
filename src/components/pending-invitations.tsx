import { useClerk, useUser } from "@clerk/tanstack-react-start"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import * as m from "#/paraglide/messages.js"
import { api, ApiError } from "#/lib/api"
import { captureAnalyticsEvent } from "#/lib/analytics"
import { isDemoMode } from "#/lib/demo-mode"
import {
  setInvitationDismissed,
  forgetInvitation,
  readPendingInvitations,
  type PendingInvitation,
} from "#/lib/pending-invitations"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog"

export function PendingInvitations() {
  return isDemoMode ? null : <AccountInvitations />
}

function AccountInvitations() {
  const { user } = useUser()
  const { signOut } = useClerk()
  if (!user) return null
  return (
    <PendingInvitationList
      account={user.primaryEmailAddress?.emailAddress ?? user.fullName ?? user.id}
      switchAccount={() => signOut({ redirectUrl: "/sign-in?redirect_url=%2Fprojects" })}
    />
  )
}

export function PendingInvitationList({
  account,
  switchAccount,
}: {
  account: string
  switchAccount: () => Promise<unknown>
}) {
  const [entries, setEntries] = useState<PendingInvitation[]>([])
  useEffect(() => {
    const refresh = () => setEntries(readPendingInvitations())
    refresh()
    window.addEventListener("storage", refresh)
    return () => window.removeEventListener("storage", refresh)
  }, [])
  const firstUndismissed = entries.find((entry) => !entry.dismissed)?.token
  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => (
        <PendingInvitationItem
          key={entry.token}
          entry={entry}
          autoOpen={entry.token === firstUndismissed}
          account={account}
          switchAccount={switchAccount}
          remove={() => {
            forgetInvitation(entry.token)
            setEntries(readPendingInvitations())
          }}
        />
      ))}
    </div>
  )
}

function PendingInvitationItem({
  entry,
  autoOpen,
  account,
  switchAccount,
  remove,
}: {
  entry: PendingInvitation
  autoOpen: boolean
  account: string
  switchAccount: () => Promise<unknown>
  remove: () => void
}) {
  const [open, setOpen] = useState(autoOpen)
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState(false)
  const url = `/api/invitations/${encodeURIComponent(entry.token)}`
  const preview = useQuery({
    queryKey: ["invitation", entry.token],
    queryFn: () => api<{ title: string; role: "editor" | "organizer"; expiresAt: string }>(url),
    retry: false,
    staleTime: 0,
  })
  const accept = useMutation({
    mutationFn: () => api<{ projectId: string }>(url, { method: "POST" }),
    onSuccess: ({ projectId }) => {
      forgetInvitation(entry.token)
      captureAnalyticsEvent("invitation:accepted", {})
      window.location.assign(`/projects/${projectId}`)
    },
    onError: () => captureAnalyticsEvent("invitation:accept_failed", {}),
  })
  const error = accept.error ?? preview.error
  const invalid = error instanceof ApiError && [400, 404, 410].includes(error.status)
  const busy = accept.isPending || switching
  function close() {
    if (busy) return
    setInvitationDismissed(entry.token, true)
    setOpen(false)
    captureAnalyticsEvent("invitation:dismissed", {})
    if (invalid) remove()
  }
  const details = (
    <>
      {preview.data && (
        <p>
          {m.invitation_project_role({
            title: preview.data.title,
            role: preview.data.role === "editor" ? m.access_editor() : m.access_organizer(),
          })}
        </p>
      )}
      {error && <p role="alert">{error.message}</p>}
    </>
  )
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex-1">{details}</div>
        {invalid ? (
          <Button variant="ghost" onClick={remove}>
            {m.ui_close()}
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => {
              setOpen(true)
              void preview.refetch()
            }}
          >
            {m.invitation_join()}
          </Button>
        )}
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close()
        }}
      >
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>{m.invitation_join()}</DialogTitle>
            <DialogDescription>{m.invitation_confirm_help()}</DialogDescription>
          </DialogHeader>
          {details}
          {!invalid && (
            <>
              <p className="break-all">{m.invitation_account({ account })}</p>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  setSwitching(true)
                  setSwitchError(false)
                  captureAnalyticsEvent("invitation:account_switch", {})
                  try {
                    setInvitationDismissed(entry.token, false)
                    await switchAccount()
                  } catch {
                    setSwitchError(true)
                    setSwitching(false)
                  }
                }}
              >
                {m.invitation_switch_account()}
              </Button>
              {switchError && <p role="alert">{m.invitation_switch_error()}</p>}
              <Button
                disabled={!preview.data || preview.isError || busy}
                onClick={() => accept.mutate()}
              >
                {m.invitation_join()}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
