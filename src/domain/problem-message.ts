import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"
import { type Locale } from "#/lib/locale.ts"
import { type PageProblem } from "./types.ts"

/** Persist facts, and render prose in the reader's current language. */
export function problemMessage(problem: PageProblem, locale: Locale = getLocale()): string {
  const p = problem.params ?? {}
  const options = { locale }
  switch (problem.code) {
    case "outside-print-area":
      return p.boundary === "bleed" ? m.problem_bleed({}, options) : m.problem_safe({}, options)
    case "empty-decorative-image":
      return m.problem_empty_image({}, options)
    case "missing-required-answer":
      return m.problem_missing_answer({}, options)
    case "unsupported-asset":
      return m.problem_unsupported({ name: p.name ?? "" }, options)
    case "image-blocking-resolution":
      return m.problem_resolution_blocking({ name: p.name ?? "", ppi: p.ppi ?? "?" }, options)
    case "image-low-resolution":
      return m.problem_resolution_low({ name: p.name ?? "", ppi: p.ppi ?? "?" }, options)
    case "text-overflow": {
      if (p.requiredLines === undefined) break
      const values = {
        name: p.occurrence
          ? m.problem_box_name(
              { name: p.name || m.ui_text({}, options), count: p.occurrence },
              options
            )
          : p.name || m.ui_text({}, options),
        location:
          typeof p.location === "number"
            ? m.response_label({ value0: p.location }, options)
            : (p.location ?? ""),
        required: p.requiredLines,
        available: p.availableLines ?? 0,
        size: p.fontSize ?? "?",
      }
      if (p.availableLines === 0)
        return m.problem_short_box(
          {
            ...values,
            needed: Number(p.lineHeightMm).toLocaleString(locale, { maximumFractionDigits: 2 }),
            height: Number(p.heightMm).toLocaleString(locale, { maximumFractionDigits: 2 }),
          },
          options
        )
      return p.policy === "truncate"
        ? m.problem_truncated(values, options)
        : m.problem_overflow(values, options)
    }
    case "photo-slot-mismatch": {
      if (p.slotCount === undefined) break
      return m.problem_photo_slots(
        {
          prompt: p.prompt ?? "",
          response: p.response ?? "",
          slots: p.slotCount,
          photos: p.photoCount ?? 0,
          unplaced: p.unplacedPhotoCount ?? 0,
          empty: p.emptySlotCount ?? 0,
        },
        options
      )
    }
    case "gallery-overflow":
      break
  }
  return m.problem_legacy({ code: problem.code }, options)
}
