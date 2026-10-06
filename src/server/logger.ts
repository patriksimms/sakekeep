import { AsyncLocalStorage } from "node:async_hooks"
import { inspect } from "node:util"

import {
  configureSync,
  getAnsiColorFormatter,
  getJsonLinesFormatter,
  getLogger,
  getTextFormatter,
  type Logger as LogTapeLogger,
  type LogRecord,
  type Sink,
  type TextFormatter,
  withContext,
  getConfig,
} from "@logtape/logtape"

export interface TraceContext {
  trace_id: string
  span_id: string
  trace_flags: string
}

export type TraceContextProvider = () => TraceContext | undefined

export interface LogDestination {
  write(chunk: string): unknown
}

export interface LoggerConfiguration {
  sinks?: Record<string, Sink>
  sanitize?: (record: LogRecord) => LogRecord
  /** Defaults to process.env.NODE_ENV. */
  nodeEnvironment?: string
  /** Omit this when OpenTelemetry is unavailable. */
  getTraceContext?: TraceContextProvider
  /** Primarily useful for focused tests. Defaults to process.stdout. */
  destination?: LogDestination
}

const contextStorage = new AsyncLocalStorage<Record<string, unknown>>()
let traceContextProvider: TraceContextProvider | undefined

/** Configure logging once in the application entry point. */
export function configureLogger(configuration: LoggerConfiguration = {}): void {
  const nodeEnvironment = configuration.nodeEnvironment ?? process.env.NODE_ENV
  const destination = configuration.destination ?? process.stdout
  const isProduction = nodeEnvironment === "production"
  const isTest = nodeEnvironment === "test"
  const useColor = !isProduction && !("NO_COLOR" in process.env)
  const formatter = isProduction ? getProductionFormatter() : getLocalFormatter(useColor)

  traceContextProvider = configuration.getTraceContext

  const stdout: Sink = (record) => {
    destination.write(formatter(configuration.sanitize?.(record) ?? record))
  }

  configureSync({
    reset: true,
    contextLocalStorage: contextStorage,
    sinks: { stdout, ...configuration.sinks },
    loggers: [
      {
        category: [],
        sinks: ["stdout", ...Object.keys(configuration.sinks ?? {})],
        lowestLevel: isTest ? null : isProduction ? "info" : "debug",
      },
      {
        category: ["logtape", "meta"],
        lowestLevel: isTest ? null : "warning",
      },
    ],
  })
}

export function isLoggerConfigured(): boolean {
  return getConfig() != null
}

/** Add request or job context to all logs within the callback. */
export function withLogContext<T>(context: Record<string, unknown>, callback: () => T): T {
  return withContext(context, callback)
}

function getLocalFormatter(useColor: boolean): TextFormatter {
  const baseFormatter = useColor
    ? getAnsiColorFormatter()
    : getTextFormatter({ timestamp: "date-time-tz" })

  return (record: LogRecord): string => {
    const message = baseFormatter(record).trimEnd()
    if (Object.keys(record.properties).length === 0) return `${message}\n`

    const properties = inspect(record.properties, {
      colors: useColor,
      compact: 3,
      depth: 10,
      breakLength: 120,
    })
    if (!properties.includes("\n")) return `${message} ${properties}\n`
    return `${message}\n  ${properties.split("\n").join("\n  ")}\n`
  }
}

function getProductionFormatter(): TextFormatter {
  const jsonLinesFormatter = getJsonLinesFormatter({ properties: "flatten" })
  const reservedFields = new Set(["@timestamp", "level", "message", "logger"])

  return (record: LogRecord): string => {
    const properties: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(record.properties)) {
      properties[reservedFields.has(key) ? `property.${key}` : key] = value
    }
    return jsonLinesFormatter({ ...record, properties })
  }
}

/** LogTape treats braces in string messages as property placeholders. */
function escapeMessageTemplate(message: string): string {
  return message.split("{").join("{{").split("}").join("}}")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value != null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Error)
  )
}

function findError(value: unknown, seen = new WeakSet<object>(), depth = 0): Error | undefined {
  if (value instanceof Error) return value
  if (value == null || typeof value !== "object" || depth >= 6 || seen.has(value)) return undefined

  seen.add(value)
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const error = findError(child, seen, depth + 1)
    if (error != null) return error
  }
  return undefined
}

function addExceptionFields(properties: Record<string, unknown>): Record<string, unknown> {
  const error = findError(properties)
  if (error == null) return properties

  return {
    ...properties,
    "exception.type": error.name || error.constructor.name,
    "exception.message": error.message,
    ...(error.stack == null ? {} : { "exception.stacktrace": error.stack }),
  }
}

function currentTraceContext(): Partial<TraceContext> {
  if (traceContextProvider == null) return {}
  try {
    return traceContextProvider() ?? {}
  } catch {
    return {}
  }
}

type PreparedCall =
  | { propertiesOnly: true; properties: Record<string, unknown> }
  | { propertiesOnly: false; message: string; properties: Record<string, unknown> }

function prepareCall(args: unknown[]): PreparedCall {
  const [first, ...rest] = args

  if (first instanceof Error) {
    const extra = rest.length === 1 && isRecord(rest[0]) ? rest[0] : {}
    return {
      propertiesOnly: false,
      message: first.message,
      properties: addExceptionFields({ ...extra, error: first }),
    }
  }

  if (typeof first === "string") {
    let properties: Record<string, unknown> = {}
    if (rest.length === 1 && isRecord(rest[0])) properties = rest[0]
    else if (rest.length === 1 && rest[0] instanceof Error) properties = { error: rest[0] }
    else if (rest.length === 1) properties = { context: rest[0] }
    else if (rest.length > 1) properties = { context: rest }

    return {
      propertiesOnly: false,
      message: first,
      properties: addExceptionFields(properties),
    }
  }

  if (isRecord(first) && rest.length === 0) {
    return { propertiesOnly: true, properties: addExceptionFields(first) }
  }

  return {
    propertiesOnly: false,
    message: first == null ? "" : String(first),
    properties: rest.length === 0 ? {} : addExceptionFields({ context: rest }),
  }
}

/** Migration-friendly facade over LogTape's native Logger. */
export default class Logger {
  readonly #logger: LogTapeLogger

  constructor(name: string | readonly string[]) {
    this.#logger = getLogger(name)
  }

  trace(...args: unknown[]): void {
    this.#log("trace", args)
  }

  debug(...args: unknown[]): void {
    this.#log("debug", args)
  }

  info(...args: unknown[]): void {
    this.#log("info", args)
  }

  warn(...args: unknown[]): void {
    this.#log("warn", args)
  }

  error(...args: unknown[]): void {
    this.#log("error", args)
  }

  fatal(...args: unknown[]): void {
    this.#log("fatal", args)
  }

  #log(methodName: "trace" | "debug" | "info" | "warn" | "error" | "fatal", args: unknown[]): void {
    const call = prepareCall(args)
    const properties = { ...call.properties, ...currentTraceContext() }
    const logger = this.#logger
    if ("message" in call) logger[methodName](escapeMessageTemplate(call.message), properties)
    else logger[methodName](properties)
  }
}
