import { ClerkProvider } from "@clerk/tanstack-react-start"
import { shadcn } from "@clerk/ui/themes"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"
import { useState } from "react"

import { Analytics } from "#/components/analytics.tsx"
import { AppHeader } from "#/components/app-header.tsx"
import { SiteFooter } from "#/components/site-footer.tsx"
import { ThemeProvider } from "#/components/theme-provider.tsx"
import { Toaster } from "#/components/ui/sonner.tsx"
import { TooltipProvider } from "#/components/ui/tooltip.tsx"
import { isDemoMode } from "#/lib/demo-mode.ts"

import appCss from "../styles.css?url"

const themeScript = `(function(){try{var t=localStorage.getItem('sakekeep-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Sakekeep — stories worth keeping",
      },
      {
        name: "description",
        content:
          "Create a shared friend book, collect anonymous stories, design pages, and export a print-ready PDF in standard DIN formats.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        href: "/favicon.ico",
        sizes: "16x16 24x24 32x32 64x64",
      },
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon.svg",
      },
      {
        rel: "apple-touch-icon",
        href: "/logo192.png",
      },
      {
        rel: "manifest",
        href: "/manifest.json",
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 5_000, retry: 1 },
          mutations: { retry: 0 },
        },
      })
  )
  const app = (
    <>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <a
              href="#main-content"
              className="fixed top-2 left-2 z-50 -translate-y-20 rounded-lg bg-primary px-3 py-2 text-primary-foreground focus:translate-y-0"
            >
              Skip to content
            </a>
            <div className="flex min-h-svh flex-col">
              <AppHeader />
              <div className="flex-1">{children}</div>
              <SiteFooter />
            </div>
            <Toaster closeButton />
            <Analytics />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
      <Scripts />
    </>
  )
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {isDemoMode ? app : <ClerkProvider appearance={{ theme: shadcn }}>{app}</ClerkProvider>}
      </body>
    </html>
  )
}
