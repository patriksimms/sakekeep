import Logger from "./logger.ts"

const logger = new Logger("health")

/**
 * Docker and Coolify give the health check 5 seconds. Without a limit, a dependency that stops
 * answering held each check open for minutes after its caller had given up, and the response
 * gave no sign of which dependency was at fault.
 */
export const HEALTH_CHECK_TIMEOUT_MS = 3_000

export type CheckStatus = "ok" | "error"

export async function runHealthCheck(
  name: string,
  check: (signal: AbortSignal) => Promise<void>
): Promise<CheckStatus> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${name} did not answer within ${HEALTH_CHECK_TIMEOUT_MS} ms`)
      controller.abort(error)
      reject(error)
    }, HEALTH_CHECK_TIMEOUT_MS)
  })
  try {
    await Promise.race([check(controller.signal), timeout])
    return "ok"
  } catch (error) {
    logger.warn("Health check failed", { check: name, error })
    return "error"
  } finally {
    clearTimeout(timer)
  }
}
