import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const alias = { "#": fileURLToPath(new URL("./src", import.meta.url)) }

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          setupFiles: ["./src/test/locale.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/**/*.integration.test.ts"],
          testTimeout: 20_000,
          hookTimeout: 20_000,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          // The target setup must run first: it redirects the database and bucket before any
          // test file imports the environment, which is read once and cached.
          setupFiles: ["./src/test/integration-target.ts", "./src/test/locale.ts"],
          include: ["src/**/*.integration.test.ts"],
          testTimeout: 20_000,
          hookTimeout: 20_000,
          // These share one database and one bucket, so they run one at a time. The unit project
          // above shares nothing and is left to Vitest's own scheduling.
          fileParallelism: false,
          maxWorkers: 1,
          sequence: { concurrent: false },
        },
      },
    ],
  },
})
