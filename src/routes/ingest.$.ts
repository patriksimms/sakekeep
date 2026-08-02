import { createFileRoute } from "@tanstack/react-router"

import { proxyPosthogRequest } from "#/server/posthog-proxy.ts"

const proxy = ({ request, params }: { request: Request; params: { _splat?: string } }) =>
  proxyPosthogRequest(request, params._splat ?? "")

export const Route = createFileRoute("/ingest/$")({
  server: {
    handlers: {
      GET: proxy,
      POST: proxy,
    },
  },
})
