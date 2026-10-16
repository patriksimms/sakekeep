import { createFileRoute } from "@tanstack/react-router"

import { checkDatabase } from "#/server/db/index.ts"
import { runHealthCheck } from "#/server/health.ts"
import { checkObjectStore } from "#/server/object-store.ts"

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const [database, objectStore] = await Promise.all([
          runHealthCheck("database", checkDatabase),
          runHealthCheck("objectStore", checkObjectStore),
        ])
        const checks = { database: { status: database }, objectStore: { status: objectStore } }
        const healthy = database === "ok" && objectStore === "ok"
        return Response.json(
          { status: healthy ? "ok" : "degraded", checks },
          { status: healthy ? 200 : 503 }
        )
      },
    },
  },
})
