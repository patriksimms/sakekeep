import * as m from "#/paraglide/messages.js"
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
    get title() {
      return m.ui_ask_what_matters()
    },
    get text() {
      return m.ui_build_a_thoughtful_questionnaire_with_text_choices_links_and_phot()
    },
  },
  {
    icon: Share2Icon,
    get title() {
      return m.ui_collect_quietly()
    },
    get text() {
      return m.ui_share_one_private_looking_link_friends_answer_anonymously_from_an()
    },
  },
  {
    icon: LayoutTemplateIcon,
    get title() {
      return m.ui_make_it_feel_personal()
    },
    get text() {
      return m.ui_compose_reusable_a5_layouts_then_tune_every_generated_page()
    },
  },
  {
    icon: BookOpenTextIcon,
    get title() {
      return m.ui_print_the_keepsake()
    },
    get text() {
      return m.ui_preflight_the_complete_book_and_export_a_bleed_ready_landscape_pd()
    },
  },
]

function Home() {
  return (
    <main id="main-content">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-14 px-4 py-16 sm:px-6 lg:grid-cols-[1.04fr_0.96fr] lg:py-24">
        <div className="flex flex-col items-start gap-7">
          <Badge variant="secondary" className="gap-1.5">
            <SparklesIcon data-icon="inline-start" />
            {m.ui_local_first_friend_books()}{" "}
          </Badge>
          <div className="flex max-w-3xl flex-col gap-5">
            <h1
              data-testid="heading-keep-the-stories-that-usually-slip-away"
              className="font-heading text-5xl leading-[0.98] font-medium tracking-tight text-balance sm:text-6xl lg:text-7xl"
            >
              {m.ui_keep_the_stories_that_usually_slip_away()}{" "}
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              {m.ui_sakekeep_turns_anonymous_notes_shared_memories_and_favourite_phot()}{" "}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              data-testid="link-start-a-project"
              to="/projects"
              className={buttonVariants({
                size: "lg",
                className: "rounded-full",
              })}
            >
              {m.ui_start_a_project()} <ArrowRightIcon data-icon="inline-end" />
            </Link>
            <a
              href="#how-it-works"
              className={buttonVariants({
                size: "lg",
                variant: "outline",
                className: "rounded-full",
              })}
            >
              {m.ui_see_how_it_works()}{" "}
            </a>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {[m.ui_secure_accounts(), m.ui_private_local_data(), m.ui_print_ready_workflow()].map(
              (label) => (
                <span key={label} className="flex items-center gap-1.5">
                  <CheckCircle2Icon aria-hidden="true" />
                  {label}
                </span>
              )
            )}
          </div>
        </div>

        <div
          className="relative mx-auto aspect-[216/154] w-full max-w-2xl"
          aria-label={m.ui_example_friend_book_pages()}
        >
          <div className="absolute inset-[5%_7%_8%_4%] rotate-[-5deg] rounded-2xl bg-secondary ring-1 ring-foreground/10" />
          <div className="paper-shadow absolute inset-[2%_2%_5%_9%] rotate-[3deg] overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
            <div className="grid h-full grid-cols-[0.95fr_1.05fr]">
              <div className="relative overflow-hidden bg-accent">
                <div className="absolute -top-6 -left-5 size-28 rounded-full border-[18px] border-background/50" />
                <div className="absolute right-5 bottom-6 left-5 rounded-xl bg-background/85 p-4 backdrop-blur">
                  <p className="font-heading text-lg">{m.ui_the_train_story()}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {m.ui_still_makes_us_laugh_every_single_time()}{" "}
                  </p>
                </div>
              </div>
              <div className="flex flex-col justify-between p-[9%]">
                <div>
                  <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                    {m.ui_for_lea()}{" "}
                  </p>
                  <h2
                    data-testid="heading-you-made-work-feel-like-home"
                    className="mt-3 font-heading text-3xl leading-tight"
                  >
                    {m.ui_you_made_work_feel_like_home()}{" "}
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
              {m.ui_from_prompt_to_print()}{" "}
            </p>
            <h2
              data-testid="heading-one-calm-workflow-four-clear-chapters"
              className="font-heading text-4xl tracking-tight"
            >
              {m.ui_one_calm_workflow_four_clear_chapters()}{" "}
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
          <h2
            data-testid="heading-someone-s-favourite-story-about-you-is-still-unwritten"
            className="max-w-2xl font-heading text-4xl tracking-tight sm:text-5xl"
          >
            {m.ui_someone_s_favourite_story_about_you_is_still_unwritten()}{" "}
          </h2>
          <p className="max-w-xl text-primary-foreground/80">
            {m.ui_build_the_first_question_now_everything_stays_on_your_local_machi()}{" "}
          </p>
          <Link
            data-testid="link-create-your-keepsake"
            to="/projects"
            className={buttonVariants({
              size: "lg",
              variant: "secondary",
              className: "rounded-full",
            })}
          >
            {m.ui_create_your_keepsake()} <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </div>
      </section>
    </main>
  )
}
