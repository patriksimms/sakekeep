import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://sakekeep:sakekeep@127.0.0.1:54321/sakekeep",
  },
  migrations: {
    prefix: "timestamp",
  },
  strict: true,
})
