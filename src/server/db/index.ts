import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { env } from "../env"
import * as schema from "./schema"

const globalForDatabase = globalThis as unknown as {
  sakekeepPool?: Pool
}

export const pool =
  globalForDatabase.sakekeepPool ??
  new Pool({
    connectionString: env().DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
  })

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.sakekeepPool = pool
}

export const db = drizzle(pool, { schema })

export async function checkDatabase(): Promise<void> {
  await pool.query("select 1")
}
