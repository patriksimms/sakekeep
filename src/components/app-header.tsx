import { captureAnalyticsEvent } from "#/lib/analytics.ts"
import { useReaderLocale } from "#/lib/reader-locale.ts"
import { Show, SignInButton, UserButton } from "@clerk/tanstack-react-start"
import { getLocale, setLocale } from "#/paraglide/runtime.js"
import * as m from "#/paraglide/messages.js"
import { useRouterState } from "@tanstack/react-router"
import { Link } from "@tanstack/react-router"
import { BookHeartIcon, LaptopIcon, MoonIcon, SunIcon } from "lucide-react"

import { useTheme } from "#/components/theme-provider.tsx"
import { Button, buttonVariants } from "#/components/ui/button.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx"
import { isDemoMode } from "#/lib/demo-mode.ts"

export function AppHeader() {
  const locale = useReaderLocale()
  const isShare = useRouterState({ select: (state) => state.location.pathname.startsWith("/s/") })
  const { theme, setTheme } = useTheme()
  const ThemeIcon = theme === "dark" ? MoonIcon : theme === "light" ? SunIcon : LaptopIcon
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-lg font-heading text-lg font-semibold focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <BookHeartIcon aria-hidden="true" />
          </span>
          Sakekeep
        </Link>
        <nav aria-label={m.ui_primary({}, { locale })} className="flex items-center gap-2">
          {isDemoMode ? (
            <Link
              data-testid="link-projects"
              to="/projects"
              className={buttonVariants({ variant: "ghost" })}
            >
              {m.ui_projects({}, { locale })}{" "}
            </Link>
          ) : (
            <>
              <Show when="signed-in">
                <Link
                  data-testid="link-projects"
                  to="/projects"
                  className={buttonVariants({ variant: "ghost" })}
                >
                  {m.ui_projects({}, { locale })}{" "}
                </Link>
              </Show>
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <Button data-testid="button-sign-in">{m.ui_sign_in({}, { locale })}</Button>
                </SignInButton>
              </Show>
              <Show when="signed-in">
                <UserButton />
              </Show>
            </>
          )}
          {!isShare && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    data-testid="language-switcher"
                    aria-label={m.language({}, { locale })}
                  />
                }
              >
                {getLocale() === "de" ? "Deutsch" : "English"}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    data-testid="language-de"
                    onClick={() => {
                      captureAnalyticsEvent("locale:changed", {
                        previous_locale: getLocale(),
                        locale: "de",
                      })
                      setLocale("de")
                    }}
                  >
                    Deutsch
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="language-en"
                    onClick={() => {
                      captureAnalyticsEvent("locale:changed", {
                        previous_locale: getLocale(),
                        locale: "en",
                      })
                      setLocale("en")
                    }}
                  >
                    English
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={m.theme_label(
                    {
                      value0:
                        theme === "system"
                          ? m.ui_system({}, { locale })
                          : theme === "dark"
                            ? m.ui_dark({}, { locale })
                            : m.ui_light({}, { locale }),
                    },
                    { locale }
                  )}
                />
              }
            >
              <ThemeIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem data-testid="menuitem-system" onClick={() => setTheme("system")}>
                  <LaptopIcon />
                  {m.ui_system({}, { locale })}{" "}
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="menuitem-light" onClick={() => setTheme("light")}>
                  <SunIcon />
                  {m.ui_light({}, { locale })}{" "}
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="menuitem-dark" onClick={() => setTheme("dark")}>
                  <MoonIcon />
                  {m.ui_dark({}, { locale })}{" "}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </header>
  )
}
