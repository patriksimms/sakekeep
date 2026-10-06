import { dispose, type LogRecord, type Sink } from "@logtape/logtape"
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs"
import { z } from "zod"

import Logger, { configureLogger, isLoggerConfigured } from "./logger.ts"

const configurationSchema = z.object({
  NODE_ENV: z.string().default("development"),
  POSTHOG_HOST: z.string().url().default("https://eu.i.posthog.com"),
  VITE_POSTHOG_PROJECT_TOKEN: z.string().optional(),
  POSTHOG_LOGS_ENABLED: z.enum(["true", "false"]).default("true"),
  VITE_SAKEKEEP_DEMO_MODE: z.string().optional(),
})

// Drizzle errors can contain SQL and contributor answers in their parameters. Keep stack
// locations, but exclude arbitrary error properties and redact credentials in error text.
function redact(text: string): string {
  return text
    .replace(/Failed query:[\s\S]*/gi, "Database query failed [redacted]")
    .replace(/(?:https?|postgres(?:ql)?):\/\/[^\s)]+/gi, "[redacted URL]")
    .replace(/((?:\/api)?\/(?:invitations|share|s))\/(?!:id\b)[^\s/?#)]+/gi, "$1/[redacted]")
    .replace(/\b(?:(?:phc|phx|sk|pk)_(?:live_|test_)?)[a-z0-9_-]+/gi, "[redacted token]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[redacted email]")
}

const databaseErrorSchema = z.object({ code: z.string().regex(/^[0-9A-Z]{5}$/) })

function safeError(error: Error, seen: WeakSet<object>) {
  const databaseError = databaseErrorSchema.safeParse(error)
  const message = databaseError.success
    ? `Database error ${databaseError.data.code}`
    : redact(error.message)
  // Remove the exact message prefix, so contributor text resembling a stack frame cannot
  // defeat redaction. Only the frames appended by the runtime are retained.
  const prefix = `${error.name}: ${error.message}`
  const stack =
    error.stack &&
    (error.stack.startsWith(prefix)
      ? `${error.name}: ${message}${redact(error.stack.slice(prefix.length))}`
      : redact(error.stack))
  return {
    name: error.name,
    message,
    stack,
    ...(error.cause === undefined ? {} : { cause: safeValue(error.cause, seen) }),
    ...(error instanceof AggregateError ? { errors: safeValue(error.errors, seen) } : {}),
  }
}

function safeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redact(value)
  if (value == null || typeof value !== "object") return value
  if (seen.has(value)) return "[circular]"
  seen.add(value)
  if (value instanceof Error) return safeError(value, seen)
  if (Array.isArray(value)) return value.map((entry) => safeValue(entry, seen))
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, safeValue(entry, seen)])
  )
}

function safeRecord(record: LogRecord): LogRecord {
  const properties = Object.fromEntries(
    Object.entries(record.properties).map(([key, value]) => [key, safeValue(value)])
  )
  const error = Object.values(record.properties).find((value) => value instanceof Error)
  if (error instanceof Error) {
    const safe = safeError(error, new WeakSet([error]))
    properties["exception.message"] = safe.message
    properties["exception.stacktrace"] = safe.stack
  }
  return { ...record, message: record.message.map((part) => safeValue(part)), properties }
}

function posthogSink(configuration: z.infer<typeof configurationSchema>): Sink {
  const provider = new LoggerProvider({
    resource: resourceFromAttributes({
      "service.name": "sakekeep",
      "deployment.environment.name": configuration.NODE_ENV,
    }),
    processors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          url: new URL("/i/v1/logs", configuration.POSTHOG_HOST).href,
          headers: { Authorization: `Bearer ${configuration.VITE_POSTHOG_PROJECT_TOKEN}` },
          timeoutMillis: 5000,
        }),
        maxQueueSize: 2048,
        maxExportBatchSize: 256,
        scheduledDelayMillis: 5000,
        exportTimeoutMillis: 5000,
      }),
    ],
  })
  const logger = provider.getLogger("sakekeep")
  const severity = { trace: 1, debug: 5, info: 9, warning: 13, error: 17, fatal: 21 }
  const sink: Sink = (record) => {
    const safe = safeRecord(record)
    // OTel attributes are scalar values; keep Error details in the explicit exception fields.
    const attributes: Record<string, string | number | boolean> = {
      logger: safe.category.join("."),
    }
    for (const [key, value] of Object.entries(safe.properties)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        attributes[key] = value
      }
    }
    logger.emit({
      timestamp: safe.timestamp,
      severityNumber: severity[safe.level],
      severityText: safe.level.toUpperCase(),
      body: safe.message.map(String).join(""),
      attributes,
    })
  }
  // configureSync accepts synchronous sinks. Explicit shutdown below flushes the exporter.
  process.once("beforeExit", () => void provider.shutdown().catch(() => {}))
  shutdownExporters.push(() => provider.shutdown())
  return sink
}

const shutdownExporters: Array<() => Promise<void>> = []

export function initializeLogging(): void {
  if (isLoggerConfigured()) return
  const parsed = configurationSchema.safeParse(process.env)
  if (!parsed.success) {
    configureLogger({ sanitize: safeRecord })
    throw new Error("Invalid logging configuration", { cause: parsed.error })
  }
  const configuration = parsed.data
  const enabled =
    configuration.NODE_ENV !== "test" &&
    configuration.VITE_SAKEKEEP_DEMO_MODE !== "true" &&
    configuration.POSTHOG_LOGS_ENABLED === "true"
  const sinks: Record<string, Sink> =
    enabled && configuration.VITE_POSTHOG_PROJECT_TOKEN
      ? { posthog: posthogSink(configuration) }
      : {}
  configureLogger({ sinks, sanitize: safeRecord })
  if (
    enabled &&
    !configuration.VITE_POSTHOG_PROJECT_TOKEN &&
    configuration.NODE_ENV !== "production"
  ) {
    new Logger("logging").warn(
      "VITE_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_PROJECT_TOKEN is configured"
    )
  }
}

export async function shutdownLogging(): Promise<void> {
  await Promise.allSettled(shutdownExporters.splice(0).map((shutdown) => shutdown()))
  await dispose()
}
