import { Suspense, useState, type ReactNode } from "react"

import { Skeleton } from "#/components/ui/skeleton.tsx"

/** Start loading on first visit, then retain autosave and generation across tab changes. */
export function DeferredWorkspaceTool({
  active,
  loadingLabel,
  children,
}: {
  active: boolean
  loadingLabel: string
  children: ReactNode
}) {
  const [visited, setVisited] = useState(false)
  if (active && !visited) setVisited(true)
  if (!active && !visited) return null

  return (
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
  )
}
