import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/tanstack-react-start"
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

export function AppHeader() {
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
        <nav aria-label="Primary" className="flex items-center gap-2">
          <Show when="signed-in">
            <Link to="/projects" className={buttonVariants({ variant: "ghost" })}>
              Projects
            </Link>
          </Show>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button variant="ghost">Sign in</Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button>Sign up</Button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="icon" aria-label={`Theme: ${theme}`} />}
            >
              <ThemeIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setTheme("system")}>
                  <LaptopIcon />
                  System
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("light")}>
                  <SunIcon />
                  Light
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")}>
                  <MoonIcon />
                  Dark
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </header>
  )
}
