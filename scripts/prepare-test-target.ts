import { spawnSync } from "node:child_process"

import { Client } from "pg"

import { assertTestTarget, testTargetEnvironment } from "../src/test/target.ts"

/**
 * Creates and migrates the database the tests own, so integration and browser runs never write to
 * the development one. Safe to run repeatedly: an existing database is left alone and migrations
 * are forward-only. The bucket needs no setup; the object store creates it on first use.
 */
const target = testTargetEnvironment()
assertTestTarget({ ...process.env, ...target })

const url = new URL(target.DATABASE_URL)
const database = url.pathname.replace(/^\//, "")
const administrative = new URL(url)
administrative.pathname = "/postgres"

const client = new Client({ connectionString: administrative.toString() })
await client.connect()
try {
  const existing = await client.query("select 1 from pg_database where datname = $1", [database])
  if (existing.rowCount === 0) {
    // The name comes from our own configuration and is validated above, not from a request.
    await client.query(`create database "${database.replace(/"/g, '""')}"`)
    console.log(`Created test database ${database}.`)
  }
} finally {
  await client.end()
}

const migrated = spawnSync("bun", ["run", "db:migrate"], {
  env: { ...process.env, ...target },
  stdio: "inherit",
})
if (migrated.status !== 0) process.exit(migrated.status ?? 1)
