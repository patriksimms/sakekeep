import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import * as m from "#/paraglide/messages.js"
import { rememberInvitation } from "#/lib/pending-invitations"

export const Route = createFileRoute("/invitations/$token")({
  head: () => ({ meta: [{ name: "referrer", content: "no-referrer" }] }),
  component: InvitationPage,
})

function InvitationPage() {
  const { token } = Route.useParams()
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      setError(m.access_error_4())
      return
    }
    try {
      rememberInvitation(token)
      // Drop Clerk's email-bound ticket before showing any authentication UI.
      // The protected homepage handles sign-in and signup with a clean return URL.
      window.location.replace("/projects")
    } catch {
      setError(m.invitation_storage_error())
    }
  }, [token])
  return (
    <main id="main-content" className="mx-auto max-w-xl px-4 py-12">
      <p role={error ? "alert" : "status"}>{error ?? m.access_joining()}</p>
    </main>
  )
}
