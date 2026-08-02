import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeftIcon, MailIcon, MapPinIcon } from "lucide-react"

import { Badge } from "#/components/ui/badge.tsx"
import { buttonVariants } from "#/components/ui/button.tsx"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card.tsx"

export const Route = createFileRoute("/imprint")({
  component: Imprint,
  head: () => ({
    meta: [
      { title: "Imprint — Sakekeep" },
      {
        name: "description",
        content: "Legal notice and contact information for Sakekeep.",
      },
    ],
  }),
})

function Imprint() {
  return (
    <main id="main-content" className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-20">
      <div className="flex flex-col gap-10">
        <div className="flex flex-col items-start gap-5">
          <Badge variant="secondary">Legal notice</Badge>
          <div className="flex flex-col gap-3">
            <h1 className="font-heading text-4xl font-medium tracking-tight sm:text-5xl">
              Imprint
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              Information pursuant to Section 5 of the German Digital Services Act (DDG).
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                <MapPinIcon aria-hidden="true" />
              </div>
              <CardTitle className="text-xl">Service provider</CardTitle>
              <CardDescription>Responsible for this website</CardDescription>
            </CardHeader>
            <CardContent>
              <address className="text-base leading-relaxed not-italic">
                <strong className="font-medium">Patrik Simms</strong>
                <br />
                Lokstedter Steindamm 96
                <br />
                22529 Hamburg
                <br />
                Germany
              </address>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                <MailIcon aria-hidden="true" />
              </div>
              <CardTitle className="text-xl">Contact</CardTitle>
              <CardDescription>How to get in touch</CardDescription>
            </CardHeader>
            <CardContent>
              <a
                href="mailto:patriksimms@outlook.de"
                className="text-base font-medium text-primary underline decoration-primary/35 underline-offset-4 transition-colors hover:decoration-primary"
              >
                patriksimms@outlook.de
              </a>
            </CardContent>
          </Card>
        </div>

        <Link
          to="/"
          className={buttonVariants({
            variant: "ghost",
            className: "self-start",
          })}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Back to Sakekeep
        </Link>
      </div>
    </main>
  )
}
