import { describe, expect, it } from "vitest"

import {
  isWellFormedShareToken,
  shareTokenForProject,
  shareTokenHash,
  shareTokenMatches,
} from "./share-token.ts"

describe("share tokens", () => {
  it("derives a stable 192-bit token and stores only its hash", () => {
    const projectId = "99999999-9999-4999-8999-999999999999"
    const token = shareTokenForProject(projectId)
    expect(token).toHaveLength(32)
    expect(Buffer.from(token, "base64url")).toHaveLength(24)
    expect(isWellFormedShareToken(token)).toBe(true)
    expect(shareTokenMatches(shareTokenHash(token), token)).toBe(true)
    expect(shareTokenMatches(shareTokenHash(token), `${token.slice(0, -1)}x`)).toBe(false)
  })
})
