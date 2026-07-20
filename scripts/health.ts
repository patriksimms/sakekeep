import { checkDatabase, pool } from "../src/server/db"
import { checkObjectStore, s3 } from "../src/server/object-store"

const checks = [
  ["PostgreSQL", checkDatabase],
  ["RustFS bucket", checkObjectStore],
] as const

let failed = false
for (const [label, check] of checks) {
  try {
    await check()
    console.log(`✓ ${label}`)
  } catch (error) {
    failed = true
    console.error(`✗ ${label}:`, error)
  }
}

await pool.end()
s3.destroy()
if (failed) process.exit(1)
