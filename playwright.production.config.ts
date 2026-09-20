import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    // The image publishes on 127.0.0.1 only; Chromium does not fall back from ::1 the way
    // Node does, so the address has to be explicit.
    baseURL: "http://127.0.0.1:33000",
    colorScheme: "light",
    trace: "retain-on-failure",
  },
})
