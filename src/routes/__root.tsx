import { ClerkProvider } from "@clerk/tanstack-react-start"
import { shadcn } from "@clerk/ui/themes"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"
import { useState } from "react"

import { AppHeader } from "#/components/app-header.tsx"
import { ThemeProvider } from "#/components/theme-provider.tsx"
import { Toaster } from "#/components/ui/sonner.tsx"
import { TooltipProvider } from "#/components/ui/tooltip.tsx"

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
          "Create a shared friend book, collect anonymous stories, design pages, and export a print-ready A5 landscape PDF.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
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
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ClerkProvider appearance={{ theme: shadcn }}>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <TooltipProvider>
                <a
                  href="#main-content"
                  className="fixed top-2 left-2 z-50 -translate-y-20 rounded-lg bg-primary px-3 py-2 text-primary-foreground focus:translate-y-0"
                >
                  Skip to content
                </a>
                <AppHeader />
                {children}
                <Toaster closeButton />
              </TooltipProvider>
            </ThemeProvider>
          </QueryClientProvider>
          <Scripts />
        </ClerkProvider>
      </body>
    </html>
  )
}
