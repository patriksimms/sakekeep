import { describe, expect, it } from "vitest"

import { proxyPosthogRequest, upstreamRequestHeaders, upstreamUrlFor } from "./posthog-proxy.ts"

const configuration = {
  POSTHOG_HOST: "https://eu.i.posthog.com",
  VITE_POSTHOG_PROJECT_TOKEN: "phc_test_token",
}

describe("upstreamUrlFor", () => {
  it("targets the configured PostHog host for event requests", () => {
    expect(upstreamUrlFor("https://eu.i.posthog.com", "e", "?ip=0")).toBe(
      "https://eu.i.posthog.com/e?ip=0"
    )
  })

  it("targets the regional assets host for static requests", () => {
    expect(upstreamUrlFor("https://eu.i.posthog.com", "static/array.js", "")).toBe(
      "https://eu-assets.i.posthog.com/static/array.js"
    )
    expect(upstreamUrlFor("https://us.i.posthog.com", "static/array.js", "")).toBe(
      "https://us-assets.i.posthog.com/static/array.js"
    )
  })

  it("keeps static requests on unknown hosts and trims trailing slashes", () => {
    expect(upstreamUrlFor("https://posthog.example.com/", "static/array.js", "")).toBe(
      "https://posthog.example.com/static/array.js"
    )
  })
})

describe("upstreamRequestHeaders", () => {
  it("never forwards client IP, cookie, or host headers", () => {
    const headers = upstreamRequestHeaders(
      new Headers({
        "CF-Connecting-IP": "203.0.113.7",
        "Content-Type": "application/json",
        Cookie: "__session=secret",
        Forwarded: "for=203.0.113.7",
        Host: "sakekeep.example.com",
        "True-Client-IP": "203.0.113.7",
        "User-Agent": "Mozilla/5.0",
        "X-Forwarded-For": "203.0.113.7",
        "X-Real-IP": "203.0.113.7",
      })
    )
    expect([...headers.keys()].sort()).toEqual(["content-type", "user-agent"])
    expect(headers.get("content-type")).toBe("application/json")
    expect(headers.get("user-agent")).toBe("Mozilla/5.0")
  })
})

describe("proxyPosthogRequest", () => {
  it("responds with 404 when no PostHog token is configured", async () => {
    const response = await proxyPosthogRequest(
      new Request("https://sakekeep.example.com/ingest/e"),
      "e",
      { ...configuration, VITE_POSTHOG_PROJECT_TOKEN: undefined }
    )
    expect(response.status).toBe(404)
  })

  it("forwards the request body and strips identifying headers", async () => {
    const seen: { url?: string; init?: RequestInit } = {}
    const fetchStub = (input: string, init?: RequestInit) => {
      seen.url = input
      seen.init = init
      return Promise.resolve(
        new Response('{"status":1}', {
          headers: { "Content-Encoding": "gzip", "Content-Type": "application/json" },
        })
      )
    }
    const response = await proxyPosthogRequest(
      new Request("https://sakekeep.example.com/ingest/e?compression=gzip-js", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "203.0.113.7",
        },
        body: '{"event":"test"}',
      }),
      "e",
      configuration,
      fetchStub
    )

    expect(seen.url).toBe("https://eu.i.posthog.com/e?compression=gzip-js")
    const headers = new Headers(seen.init?.headers)
    expect(headers.get("x-forwarded-for")).toBeNull()
    expect(headers.get("content-type")).toBe("application/json")
    expect(new TextDecoder().decode(seen.init?.body as ArrayBuffer)).toBe('{"event":"test"}')
    expect(response.status).toBe(200)
    expect(response.headers.get("content-encoding")).toBeNull()
    expect(await response.text()).toBe('{"status":1}')
  })

  it("responds with 502 when PostHog is unreachable", async () => {
    const fetchStub = () => Promise.reject(new Error("connect ECONNREFUSED"))
    const response = await proxyPosthogRequest(
      new Request("https://sakekeep.example.com/ingest/e"),
      "e",
      configuration,
      fetchStub
    )
    expect(response.status).toBe(502)
  })
})
