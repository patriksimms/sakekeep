import * as m from "#/paraglide/messages.js"
import { createMiddleware } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "./db"
import { assets, exportsTable } from "./db/schema"
import { type ClerkRequestContext } from "./auth-policy"
import { HttpError, jsonError } from "./http"
import { requireProjectRole } from "./project-access"

// Explicit content routes get editor access. New project operations default to management.
export function projectPermission(method: string, resource: string): "edit" | "manage" | "owner" {
  if (method === "GET" || method === "HEAD") return "edit"
  if (resource === "" && method === "DELETE") return "owner"
  if (resource === "ownership") return "owner"
  if (/^(assets(?:\/[^/]+)?|layouts(?:\/[^/]+)?|submissions\/[^/]+|book|export)$/.test(resource))
    return "edit"
  return "manage"
}

export const projectAuthorizationMiddleware = createMiddleware({ type: "request" }).server(
  async ({ context, request, next }) => {
    // TanStack matches routes case-insensitively. Protected IDs are UUIDs.
    const pathname = new URL(request.url).pathname.toLowerCase().replace(/\/+$/, "")
    try {
      const projectMatch = /^\/(?:api\/)?projects\/([^/]+)(?:\/(.*))?$/.exec(pathname)
      const assetMatch = /^\/api\/(assets|exports)\/([^/]+)$/.exec(pathname)
      if (!projectMatch && !assetMatch) return next()
      const authenticate = (context as ClerkRequestContext | undefined)?.auth
      if (!authenticate) throw new Error("Clerk authentication context is unavailable.")
      const { userId } = await authenticate({ treatPendingAsSignedOut: true })
      if (!userId) throw new HttpError(401, "Authentication required.")
      let projectId: string
      if (projectMatch) {
        projectId = z.uuid().parse(projectMatch[1])
      } else {
        const id = z.uuid().parse(assetMatch![2])
        const table = assetMatch![1] === "assets" ? assets : exportsTable
        const [record] = await db
          .select({ projectId: table.projectId })
          .from(table)
          .where(eq(table.id, id))
        if (!record) throw new HttpError(404, m.access_error_11())
        projectId = record.projectId
      }
      await requireProjectRole(
        projectId,
        userId,
        projectPermission(request.method, projectMatch?.[2] ?? "")
      )
      return next()
    } catch (error) {
      if (!pathname.startsWith("/api/") && error instanceof HttpError && error.status === 404) {
        return new Response(null, {
          status: 307,
          headers: { Location: "/projects", "Cache-Control": "no-store" },
        })
      }
      return jsonError(error)
    }
  }
)
