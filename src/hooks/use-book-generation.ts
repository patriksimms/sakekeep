import { useCallback, useEffect, useRef, useState } from "react"

import type { GenerationSettings, Project } from "#/domain/types.ts"
import { captureAnalyticsEvent } from "#/lib/analytics.ts"
import { projectApi } from "#/lib/api.ts"

export type RegenerationCause =
  | "saved_inputs"
  | "assignment_mode"
  | "random_seed"
  | "manual_assignment"
  | "resolution_override"
  | "page_order"
  | "standalone_page"

type Trigger = "review_open" | "book_change" | "retry"

export function useBookGeneration({
  project,
  active,
  onProjectChange,
  beforeGenerate,
  onBusyChange,
}: {
  project: Project
  active: boolean
  onProjectChange: (project: Project) => void
  beforeGenerate?: () => Promise<Project>
  onBusyChange?: (busy: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const locked = useRef(false)
  const failure = useRef(false)
  const cause = useRef<RegenerationCause>("saved_inputs")
  const latest = useRef({ project, active, onProjectChange, beforeGenerate, onBusyChange })
  latest.current = { project, active, onProjectChange, beforeGenerate, onBusyChange }

  const setWorking = useCallback((working: boolean) => {
    locked.current = working
    setBusy(working)
    latest.current.onBusyChange?.(working)
  }, [])

  const generate = useCallback(
    async (trigger: Trigger | "initial", settings?: GenerationSettings) => {
      if (locked.current) return
      const current = latest.current.project
      if (current.archivedAt || current.state !== "closed") return
      if (trigger !== "initial" && !latest.current.beforeGenerate && current.bookStatus !== "stale")
        return
      setWorking(true)
      setError(null)
      failure.current = false
      const started = performance.now()
      const automatic = trigger !== "initial"
      const properties = { trigger: trigger as Trigger, stale_cause: cause.current }
      let attempted = false
      try {
        const saved = (await latest.current.beforeGenerate?.()) ?? latest.current.project
        if (saved.archivedAt || saved.state !== "closed") return
        if (automatic && (!latest.current.active || !saved.book || saved.bookStatus !== "stale"))
          return
        if (automatic) {
          captureAnalyticsEvent("book_review:regeneration_attempt", properties)
          attempted = true
        }
        const updated = await projectApi.generate(saved.id, settings ?? saved.book!.settings)
        if (!updated) throw new Error("Generation returned no book.")
        latest.current.onProjectChange({
          ...latest.current.project,
          book: updated,
          bookStatus: "current",
        })
        if (automatic)
          captureAnalyticsEvent("book_review:regeneration_success", {
            ...properties,
            duration_ms: performance.now() - started,
          })
      } catch (caught) {
        failure.current = true
        setError(caught instanceof Error ? caught.message : "Generation failed")
        if (automatic) {
          // Waiting for a layout save is part of the attempt, including a failed flush.
          if (!attempted) captureAnalyticsEvent("book_review:regeneration_attempt", properties)
          captureAnalyticsEvent("book_review:regeneration_failure", {
            ...properties,
            duration_ms: performance.now() - started,
          })
        }
      } finally {
        setWorking(false)
      }
    },
    [setWorking]
  )

  const wasActive = useRef(false)
  useEffect(() => {
    const opened = active && !wasActive.current
    wasActive.current = active
    if (!active || !project.book) return
    if (opened) {
      cause.current = "saved_inputs"
      void generate("review_open")
    } else if (project.bookStatus === "stale" && !failure.current) {
      void generate("book_change")
    }
  }, [active, project.book, project.bookStatus, generate])

  const updateBook = async (
    input: Parameters<typeof projectApi.updateBook>[1],
    staleCause: RegenerationCause
  ) => {
    if (locked.current) return
    setWorking(true)
    try {
      const updated = await projectApi.updateBook(latest.current.project.id, input)
      cause.current = staleCause
      failure.current = false
      setError(null)
      latest.current.onProjectChange({
        ...latest.current.project,
        book: updated,
        bookStatus: "stale",
      })
    } finally {
      setWorking(false)
    }
  }

  return {
    busy,
    error,
    updateBook,
    generateInitial: (settings: GenerationSettings) => generate("initial", settings),
    retry: () => {
      captureAnalyticsEvent("book_review:regeneration_retry", { stale_cause: cause.current })
      void generate(project.book ? "retry" : "initial", project.book?.settings)
    },
  }
}
