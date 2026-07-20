import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { AlertCircleIcon, LoaderCircleIcon, LockIcon } from "lucide-react"

import { PublicForm } from "#/components/public-form.tsx"
import { Button } from "#/components/ui/button.tsx"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty.tsx"
import { type FormSchema } from "#/domain/types.ts"

export const Route = createFileRoute("/s/$token")({
  component: SharePage,
})

type PublicState =
  | { status: "collecting"; title: string; formSchema: FormSchema }
  | { status: "closed"; message: string }
  | { status: "unknown"; message: string }

async function loadForm(token: string): Promise<PublicState> {
  const response = await fetch(`/api/share/${token}`)
  const payload = (await response.json()) as PublicState
  if (!response.ok && payload.status !== "unknown") {
    throw new Error("The local form service could not be reached.")
  }
  return payload
}

function SharePage() {
  const { token } = Route.useParams()
  const form = useQuery({
    queryKey: ["share", token],
    queryFn: () => loadForm(token),
    retry: false,
  })
  const publicState = form.data

  return (
    <main id="main-content" className="min-h-[calc(100vh-4rem)] px-4 py-10 sm:px-6 sm:py-16">
      {form.isLoading ? (
        <div className="flex min-h-80 items-center justify-center">
          <LoaderCircleIcon className="animate-spin" aria-label="Loading form" />
        </div>
      ) : form.isError ? (
        <Empty className="mx-auto min-h-80 max-w-xl border bg-card/90">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AlertCircleIcon />
            </EmptyMedia>
            <EmptyTitle>Could not load this form</EmptyTitle>
            <EmptyDescription>{form.error.message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => form.refetch()}>
              Retry
            </Button>
          </EmptyContent>
        </Empty>
      ) : publicState?.status === "collecting" ? (
        <PublicForm token={token} title={publicState.title} formSchema={publicState.formSchema} />
      ) : publicState ? (
        <Empty className="mx-auto min-h-80 max-w-xl border bg-card/90">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LockIcon />
            </EmptyMedia>
            <EmptyTitle>
              {publicState.status === "closed" ? "Collection is closed" : "Share link not found"}
            </EmptyTitle>
            <EmptyDescription>{publicState.message}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div />
      )}
    </main>
  )
}
