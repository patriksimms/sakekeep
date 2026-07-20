import { createFileRoute, Link } from "@tanstack/react-router"
import {
  ArrowRightIcon,
  BookOpenTextIcon,
  CheckCircle2Icon,
  LayoutTemplateIcon,
  MessageSquareHeartIcon,
  Share2Icon,
  SparklesIcon,
} from "lucide-react"

import { Badge } from "#/components/ui/badge.tsx"
import { buttonVariants } from "#/components/ui/button.tsx"
import { Card, CardDescription, CardHeader, CardTitle } from "#/components/ui/card.tsx"

export const Route = createFileRoute("/")({ component: Home })

const workflow = [
  {
    icon: MessageSquareHeartIcon,
    title: "Ask what matters",
    text: "Build a thoughtful questionnaire with text, choices, links, and photos.",
  },
  {
    icon: Share2Icon,
    title: "Collect quietly",
    text: "Share one private-looking link. Friends answer anonymously from any device.",
  },
  {
    icon: LayoutTemplateIcon,
    title: "Make it feel personal",
    text: "Compose reusable A5 layouts, then tune every generated page.",
  },
  {
    icon: BookOpenTextIcon,
    title: "Print the keepsake",
    text: "Preflight the complete book and export a bleed-ready landscape PDF.",
  },
]

function Home() {
  return (
    <main id="main-content">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-14 px-4 py-16 sm:px-6 lg:grid-cols-[1.04fr_0.96fr] lg:py-24">
        <div className="flex flex-col items-start gap-7">
          <Badge variant="secondary" className="gap-1.5">
            <SparklesIcon data-icon="inline-start" />
            Local-first friend books
          </Badge>
          <div className="flex max-w-3xl flex-col gap-5">
            <h1 className="font-heading text-5xl leading-[0.98] font-medium tracking-tight text-balance sm:text-6xl lg:text-7xl">
              Keep the stories that usually slip away.
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Sakekeep turns anonymous notes, shared memories, and favourite photos into a
              beautifully composed book for birthdays and farewells.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/projects"
              className={buttonVariants({
                size: "lg",
                className: "rounded-full",
              })}
            >
              Start a project
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
            <a
              href="#how-it-works"
              className={buttonVariants({
                size: "lg",
                variant: "outline",
                className: "rounded-full",
              })}
            >
              See how it works
            </a>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {["Secure accounts", "Private local data", "Print-ready workflow"].map((label) => (
              <span key={label} className="flex items-center gap-1.5">
                <CheckCircle2Icon aria-hidden="true" />
                {label}
              </span>
            ))}
          </div>
        </div>

        <div
          className="relative mx-auto aspect-[216/154] w-full max-w-2xl"
          aria-label="Example friend-book pages"
        >
          <div className="absolute inset-[5%_7%_8%_4%] rotate-[-5deg] rounded-2xl bg-secondary ring-1 ring-foreground/10" />
          <div className="paper-shadow absolute inset-[2%_2%_5%_9%] rotate-[3deg] overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
            <div className="grid h-full grid-cols-[0.95fr_1.05fr]">
              <div className="relative overflow-hidden bg-accent">
                <div className="absolute -top-6 -left-5 size-28 rounded-full border-[18px] border-background/50" />
                <div className="absolute right-5 bottom-6 left-5 rounded-xl bg-background/85 p-4 backdrop-blur">
                  <p className="font-heading text-lg">“The train story.”</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Still makes us laugh every single time.
                  </p>
                </div>
              </div>
              <div className="flex flex-col justify-between p-[9%]">
                <div>
                  <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                    For Lea
                  </p>
                  <h2 className="mt-3 font-heading text-3xl leading-tight">
                    You made work feel like home.
                  </h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="aspect-square rounded-xl bg-muted" />
                  <div className="aspect-square rounded-xl bg-secondary" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-y bg-card/65 py-20 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-10 flex max-w-2xl flex-col gap-3">
            <p className="text-sm font-semibold tracking-[0.16em] text-primary uppercase">
              From prompt to print
            </p>
            <h2 className="font-heading text-4xl tracking-tight">
              One calm workflow, four clear chapters.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {workflow.map((item, index) => (
              <Card key={item.title} className="min-h-56 bg-background/80">
                <CardHeader>
                  <div className="mb-5 flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                      <item.icon aria-hidden="true" />
                    </span>
                    <span className="font-heading text-2xl text-muted-foreground/60">
                      0{index + 1}
                    </span>
                  </div>
                  <CardTitle className="text-xl">{item.title}</CardTitle>
                  <CardDescription className="leading-relaxed">{item.text}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-24 text-center sm:px-6">
        <div className="flex flex-col items-center gap-6 rounded-3xl bg-primary px-6 py-16 text-primary-foreground sm:px-12">
          <h2 className="max-w-2xl font-heading text-4xl tracking-tight sm:text-5xl">
            Someone’s favourite story about you is still unwritten.
          </h2>
          <p className="max-w-xl text-primary-foreground/80">
            Build the first question now. Everything stays on your local machine while you explore
            the complete workflow.
          </p>
          <Link
            to="/projects"
            className={buttonVariants({
              size: "lg",
              variant: "secondary",
              className: "rounded-full",
            })}
          >
            Create your keepsake
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </div>
      </section>
    </main>
  )
}
