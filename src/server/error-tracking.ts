import { PostHog } from "posthog-node"

import { env } from "#/server/env.ts"

export type ServerExceptionSink = Pick<PostHog, "captureException">

// Server exceptions carry a fixed distinct id and no extra properties: no user ids, email
// addresses, or IP addresses may reach PostHog from the server.
const SERVER_DISTINCT_ID = "sakekeep-server"

let sink: ServerExceptionSink | null | undefined

export function setServerExceptionSinkForTesting(next: ServerExceptionSink | null | undefined) {
  sink = next
}

function serverExceptionSink(): ServerExceptionSink | null {
  if (sink === undefined) {
    const configuration = env()
    sink =
      configuration.VITE_POSTHOG_PROJECT_TOKEN && configuration.NODE_ENV !== "test"
        ? new PostHog(configuration.VITE_POSTHOG_PROJECT_TOKEN, {
            host: configuration.POSTHOG_HOST,
            disableGeoip: true,
          })
        : null
  }
  return sink
}

export function captureServerException(error: unknown): void {
  try {
    const client = serverExceptionSink()
    if (!client) return
    client.captureException(
      error instanceof Error ? error : new Error(String(error)),
      SERVER_DISTINCT_ID
    )
  } catch {
    // Error reporting must never break request handling.
  }
}
