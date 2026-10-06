import Logger, { withLogContext } from "./logger.ts"
import { initializeLogging } from "./logging.ts"

const logger = new Logger("request")
const routes = [
  /^\/(?:privacy|imprint|layout-parity|projects)?\/?$/,
  /^\/projects\/[^/]+$/,
  /^\/(?:invitations|s)\/[^/]+$/,
  /^\/(?:sign-in|sign-up)(?:\/.*)?$/,
  /^\/api\/projects$/,
  /^\/api\/projects\/[^/]+(?:\/(?:duplicate|export|collaborators|close|book|publish|archive|unarchive|responses\.xlsx))?$/,
  /^\/api\/projects\/[^/]+\/(?:assets|layouts)(?:\/[^/]+)?$/,
  /^\/api\/projects\/[^/]+\/submissions\/[^/]+$/,
  /^\/api\/(?:assets|exports|invitations|share)\/[^/]+$/,
  /^\/api\/health$/,
  /^\/ingest(?:\/.*)?$/,
]

/** Only known route templates reach logs. Unknown paths can contain arbitrary private text. */
export function logRoute(pathname: string): string {
  if (!routes.some((route) => route.test(pathname))) return "/unknown"
  return pathname
    .replace(
      /\/(projects|assets|exports|layouts|submissions|invitations|share|s)\/[^/]+/g,
      "/$1/:id"
    )
    .replace(/\/(sign-in|sign-up|ingest)(?:\/.*)?$/, "/$1/*")
}

export function logRequest<T extends { response: Response }>(
  request: Request,
  next: () => T | Promise<T>
): Promise<T> {
  initializeLogging()
  const route = logRoute(new URL(request.url).pathname)
  const started = performance.now()
  return withLogContext(
    { requestId: crypto.randomUUID(), method: request.method, route },
    async () => {
      let status = 500
      try {
        const result = await next()
        status = result.response.status
        return result
      } catch (error) {
        logger.error("Request handler failed", { error })
        throw error
      } finally {
        if (status >= 400 || (route !== "/api/health" && route !== "/ingest/*")) {
          const fields = {
            status,
            durationMs: Math.round(performance.now() - started),
            clientDisconnected: request.signal.aborted,
          }
          if (status >= 500) logger.error("Request completed", fields)
          else logger.info("Request completed", fields)
        }
      }
    }
  )
}
