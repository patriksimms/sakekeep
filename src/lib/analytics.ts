import type { PostHog } from "posthog-js"

import { isDemoMode } from "#/lib/demo-mode.ts"

const configuredToken: string | undefined = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN as
  | string
  | undefined

// Demo builds must never send events, even when a token leaks into the build environment.
export const posthogToken = isDemoMode ? undefined : configuredToken

const ANALYTICS_CATEGORY = "analytics"
const CONSENT_STORAGE_DAYS = 365

let client: PostHog | undefined
let desiredUserId: string | undefined
let userKnown = false

function applyAnalyticsUser() {
  if (!client) return
  if (desiredUserId) {
    if (client.get_distinct_id() !== desiredUserId) client.identify(desiredUserId)
  } else if (userKnown && client.get_distinct_id() !== client.get_property("$device_id")) {
    client.reset()
  }
}

export function setAnalyticsUser(userId: string | undefined) {
  desiredUserId = userId
  userKnown = true
  applyAnalyticsUser()
}

async function startAnalytics() {
  if (!posthogToken) return
  if (client) {
    if (client.has_opted_out_capturing()) client.opt_in_capturing()
    return
  }
  const { default: posthog } = await import("posthog-js")
  client = posthog.init(posthogToken, {
    api_host: "/ingest",
    defaults: "2025-05-24",
    capture_pageview: "history_change",
    capture_exceptions: true,
    disable_session_recording: true,
    persistence: "localStorage+cookie",
  })
  if (client.has_opted_out_capturing()) client.opt_in_capturing()
  applyAnalyticsUser()
}

function stopAnalytics() {
  client?.opt_out_capturing()
}

async function applyConsent(acceptedCategories: string[]) {
  if (acceptedCategories.includes(ANALYTICS_CATEGORY)) await startAnalytics()
  else stopAnalytics()
}

export async function showCookieSettings() {
  if (!posthogToken) return
  const CookieConsent = await import("vanilla-cookieconsent")
  try {
    CookieConsent.showPreferences()
  } catch {
    // The consent UI never exists when cookieconsent classified the browser as a bot.
  }
}

export async function setupAnalyticsConsent() {
  if (!posthogToken || typeof window === "undefined") return
  const [CookieConsent] = await Promise.all([
    import("vanilla-cookieconsent"),
    import("vanilla-cookieconsent/dist/cookieconsent.css"),
  ])
  await CookieConsent.run({
    cookie: { expiresAfterDays: CONSENT_STORAGE_DAYS },
    categories: {
      necessary: { enabled: true, readOnly: true },
      [ANALYTICS_CATEGORY]: {},
    },
    onConsent: ({ cookie }) => {
      void applyConsent(cookie.categories)
    },
    onChange: ({ cookie }) => {
      void applyConsent(cookie.categories)
    },
    language: {
      default: "en",
      translations: {
        en: {
          consentModal: {
            title: "Cookies & analytics",
            description:
              "Sakekeep uses PostHog analytics to understand how the app is used and to notice errors. Analytics only runs if you agree. Technically necessary storage is always active.",
            acceptAllBtn: "Accept analytics",
            acceptNecessaryBtn: "Decline analytics",
            showPreferencesBtn: "Manage preferences",
            footer: '<a href="/privacy">Privacy Policy</a>',
          },
          preferencesModal: {
            title: "Cookie preferences",
            acceptAllBtn: "Accept analytics",
            acceptNecessaryBtn: "Decline analytics",
            savePreferencesBtn: "Save preferences",
            closeIconLabel: "Close",
            sections: [
              {
                title: "Technically necessary",
                description:
                  "Required for sign-in, session handling, and remembering your consent choice. Your consent decision is stored in your browser for 365 days.",
                linkedCategory: "necessary",
              },
              {
                title: "Analytics (PostHog)",
                description:
                  "Measures pageviews, feature usage, and browser errors so we can improve Sakekeep. PostHog stores identifiers in cookies and localStorage. If you are signed in, your account ID is linked to your analytics profile.",
                linkedCategory: ANALYTICS_CATEGORY,
              },
              {
                title: "More information",
                description:
                  'Details on data processing are described in our <a href="/privacy">Privacy Policy</a>.',
              },
            ],
          },
        },
      },
    },
  })
}
