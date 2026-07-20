import { cleanupOrphanedObjects } from "../src/server/repository"
import { pool } from "../src/server/db"
import { s3 } from "../src/server/object-store"

const result = await cleanupOrphanedObjects()
console.log(
  `Removed ${result.removed} orphaned object(s); ${result.remaining} remain for a later retry.`
)
await pool.end()
s3.destroy()
