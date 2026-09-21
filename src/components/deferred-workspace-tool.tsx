import { Suspense, useState, type ReactNode } from "react"
import { CatchBoundary } from "@tanstack/react-router"

import { Button } from "#/components/ui/button.tsx"
import { Skeleton } from "#/components/ui/skeleton.tsx"
import { captureAnalyticsEvent } from "#/lib/analytics.ts"
import * as m from "#/paraglide/messages.js"

function ToolLoadError() {
  return (
    <div role="alert" className="flex flex-col items-start gap-4">
      <p>{m.ui_workspace_tool_failed()}</p>
      {/* React.lazy caches rejected imports, so recovery needs a fresh page. */}
      <Button variant="outline" onClick={() => window.location.reload()}>
        {m.ui_reload_page()}
      </Button>
    </div>
  )
}

/** Start loading on first visit, then retain autosave and generation across tab changes. */
export function DeferredWorkspaceTool({
  active,
  tool,
  loadingLabel,
  children,
}: {
  active: boolean
  tool: "layouts" | "book"
  loadingLabel: string
  children: ReactNode
}) {
  const [visited, setVisited] = useState(false)
  if (active && !visited) setVisited(true)
  if (!active && !visited) return null

  return (
    <CatchBoundary
      getResetKey={() => tool}
      errorComponent={ToolLoadError}
      onCatch={() => captureAnalyticsEvent("workspace:tool_failed", { tool })}
    >
      <Suspense
        fallback={
          <div role="status" className="flex flex-col gap-4">
            <p className="text-muted-foreground">{loadingLabel}</p>
            <Skeleton className="h-96 w-full" />
          </div>
        }
      >
        {children}
      </Suspense>
    </CatchBoundary>
  )
}
