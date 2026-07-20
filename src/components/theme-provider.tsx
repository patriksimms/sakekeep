import { useEffect, useState, type ReactNode } from "react"

type Theme = "light" | "dark" | "system"
const storageKey = "sakekeep-theme"

function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", dark)
  document.documentElement.style.colorScheme = dark ? "dark" : "light"
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("system")

  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    const initial = saved === "light" || saved === "dark" || saved === "system" ? saved : "system"
    setTheme(initial)
    applyTheme(initial)
  }, [])

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const listener = () => applyTheme(theme)
    media.addEventListener("change", listener)
    return () => media.removeEventListener("change", listener)
  }, [theme])

  const cycle = () => {
    const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system"
    setTheme(next)
    localStorage.setItem(storageKey, next)
    applyTheme(next)
  }

  return (
    <div data-theme={theme}>
      {children}
      <button type="button" className="sr-only" onClick={cycle} data-theme-toggle-hidden>
        Cycle theme
      </button>
    </div>
  )
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system")
  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    setThemeState(saved === "light" || saved === "dark" || saved === "system" ? saved : "system")
  }, [])
  const setTheme = (next: Theme) => {
    setThemeState(next)
    localStorage.setItem(storageKey, next)
    applyTheme(next)
  }
  return { theme, setTheme }
}
