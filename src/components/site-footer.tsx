import { Link } from "@tanstack/react-router"

import { posthogToken, showCookieSettings } from "#/lib/analytics.ts"

const legalLinkClassName =
  "rounded-sm underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-6">
        <p>© {new Date().getFullYear()} Sakekeep</p>
        <nav aria-label="Legal" className="flex items-center gap-4">
          <Link to="/privacy" className={legalLinkClassName}>
            Privacy
          </Link>
          <Link to="/imprint" className={legalLinkClassName}>
            Imprint
          </Link>
          {posthogToken ? (
            <button
              type="button"
              onClick={() => void showCookieSettings()}
              className={legalLinkClassName}
            >
              Cookie settings
            </button>
          ) : null}
        </nav>
      </div>
    </footer>
  )
}
