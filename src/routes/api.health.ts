import { createFileRoute } from "@tanstack/react-router"

import { checkDatabase } from "#/server/db/index.ts"
import { jsonError } from "#/server/http.ts"
import { checkObjectStore } from "#/server/object-store.ts"

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const checks = {
          database: { status: "unknown" as "unknown" | "ok" | "error" },
          objectStore: { status: "unknown" as "unknown" | "ok" | "error" },
        }
        try {
          await checkDatabase()
          checks.database.status = "ok"
        } catch {
          checks.database.status = "error"
        }
        try {
          await checkObjectStore()
          checks.objectStore.status = "ok"
        } catch {
          checks.objectStore.status = "error"
        }
        const healthy = Object.values(checks).every((check) => check.status === "ok")
        try {
          return Response.json(
            { status: healthy ? "ok" : "degraded", checks },
            { status: healthy ? 200 : 503 }
          )
        } catch (error) {
          return jsonError(error)
        }
      },
    },
  },
})
