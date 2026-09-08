import * as m from "#/paraglide/messages.js"
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
import { loadPublicProject } from "#/lib/public-project.ts"
import { useReaderLocale } from "#/lib/reader-locale.ts"

export const Route = createFileRoute("/s/$token")({
  component: SharePage,
})

function SharePage() {
  const locale = useReaderLocale()
  const { publicState: initialState } = Route.useRouteContext()
  const { token } = Route.useParams()
  const form = useQuery({
    queryKey: ["share", token],
    queryFn: () => loadPublicProject(token),
    initialData: initialState,
    retry: false,
  })
  const publicState = form.data

  return (
    <main id="main-content" className="px-4 py-10 sm:px-6 sm:py-16">
      {form.isLoading ? (
        <div className="flex min-h-80 items-center justify-center">
          <LoaderCircleIcon
            className="animate-spin"
            aria-label={m.ui_loading_form({}, { locale })}
          />
        </div>
      ) : form.isError ? (
        <Empty className="mx-auto min-h-80 max-w-xl border bg-card/90">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AlertCircleIcon />
            </EmptyMedia>
            <EmptyTitle data-testid="heading-could-not-load-this-form">
              {m.ui_could_not_load_this_form({}, { locale })}
            </EmptyTitle>
            <EmptyDescription>{form.error.message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button data-testid="button-retry" variant="outline" onClick={() => form.refetch()}>
              {m.ui_retry({}, { locale })}{" "}
            </Button>
          </EmptyContent>
        </Empty>
      ) : publicState?.status === "collecting" ? (
        <PublicForm
          locale={publicState.bookLanguage}
          token={token}
          title={publicState.title}
          formSchema={publicState.formSchema}
        />
      ) : publicState ? (
        <Empty className="mx-auto min-h-80 max-w-xl border bg-card/90">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LockIcon />
            </EmptyMedia>
            <EmptyTitle data-testid="heading-collection-is-closed">
              {publicState.status === "closed"
                ? m.ui_collection_is_closed({}, { locale })
                : m.ui_share_link_not_found({}, { locale })}
            </EmptyTitle>
            <EmptyDescription>
              {publicState.status === "closed"
                ? m.ui_this_collection_is_permanently_closed({}, { locale })
                : m.ui_this_share_link_is_unknown_or_malformed({}, { locale })}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div />
      )}
    </main>
  )
}
