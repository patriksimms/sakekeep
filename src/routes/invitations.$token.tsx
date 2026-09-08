import { useAuth, SignUp } from "@clerk/tanstack-react-start"
import { createFileRoute } from "@tanstack/react-router"
import { useMutation } from "@tanstack/react-query"
import { useEffect } from "react"
import * as m from "#/paraglide/messages.js"
import { api } from "#/lib/api"
import { captureAnalyticsEvent } from "#/lib/analytics"
import { Button } from "#/components/ui/button"

export const Route = createFileRoute("/invitations/$token")({ component: InvitationPage })

function InvitationPage() {
  const { token } = Route.useParams()
  const { isLoaded, isSignedIn } = useAuth()
  const returnPath = `/invitations/${encodeURIComponent(token)}`
  const accept = useMutation({
    mutationFn: () =>
      api<{ projectId: string }>(`/api/invitations/${encodeURIComponent(token)}`, {
        method: "POST",
      }),
    onSuccess: ({ projectId }) => {
      captureAnalyticsEvent("invitation:accepted", {})
      // A full navigation drops any project data cached for an earlier session.
      window.location.assign(`/projects/${projectId}`)
    },
  })
  useEffect(() => {
    if (isSignedIn && accept.isIdle) accept.mutate()
  }, [isSignedIn, accept.isIdle, accept.mutate])
  return (
    <main
      id="main-content"
      className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 py-12"
    >
      <h1 className="font-heading text-3xl">{m.access_accept_title()}</h1>
      {!isLoaded ? (
        <p>{m.access_joining()}</p>
      ) : !isSignedIn ? (
        <>
          <SignUp
            routing="hash"
            forceRedirectUrl={returnPath}
            signInUrl={`/sign-in?redirect_url=${encodeURIComponent(returnPath)}`}
          />
          <a href={`/sign-in?redirect_url=${encodeURIComponent(returnPath)}`}>
            {m.access_sign_in()}
          </a>
        </>
      ) : accept.isError ? (
        <>
          <p role="alert">{accept.error.message}</p>
          <Button onClick={() => accept.mutate()}>{m.ui_retry()}</Button>
        </>
      ) : (
        <p>{m.access_joining()}</p>
      )}
    </main>
  )
}
