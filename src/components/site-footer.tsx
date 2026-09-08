import { useReaderLocale } from "#/lib/reader-locale.ts"
import * as m from "#/paraglide/messages.js"
import { Link } from "@tanstack/react-router"

import { posthogToken, showCookieSettings } from "#/lib/analytics.ts"

const legalLinkClassName =
  "rounded-sm underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"

export function SiteFooter() {
  const locale = useReaderLocale()
  return (
    <footer className="border-t border-border/70">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-6">
        <p>© {new Date().getFullYear()} Sakekeep</p>
        <nav aria-label={m.ui_legal({}, { locale })} className="flex items-center gap-4">
          <Link data-testid="link-privacy" to="/privacy" className={legalLinkClassName}>
            {m.ui_privacy({}, { locale })}{" "}
          </Link>
          <Link data-testid="link-imprint" to="/imprint" className={legalLinkClassName}>
            {m.ui_imprint({}, { locale })}{" "}
          </Link>
          {posthogToken ? (
            <button
              type="button"
              onClick={() => void showCookieSettings()}
              className={legalLinkClassName}
            >
              {m.ui_cookie_settings({}, { locale })}{" "}
            </button>
          ) : null}
        </nav>
      </div>
    </footer>
  )
}
