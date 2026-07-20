import { createHash, createHmac, timingSafeEqual } from "node:crypto"

import { env } from "./env"

export function shareTokenForProject(projectId: string): string {
  return createHmac("sha256", env().SHARE_TOKEN_SECRET)
    .update(`sakekeep-share:v1:${projectId}`)
    .digest()
    .subarray(0, 24)
    .toString("base64url")
}

export function shareTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function isWellFormedShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(token)
}

export function shareTokenMatches(hash: string, token: string): boolean {
  if (!isWellFormedShareToken(token)) return false
  const candidate = Buffer.from(shareTokenHash(token), "hex")
  const expected = Buffer.from(hash, "hex")
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}
