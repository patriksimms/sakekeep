import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://localhost:33000",
    colorScheme: "light",
    trace: "retain-on-failure",
  },
})
