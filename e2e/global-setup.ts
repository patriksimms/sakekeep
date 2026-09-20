import { spawn } from "node:child_process"

import { assertTestTarget, testTargetEnvironment } from "../src/test/target.ts"

/**
 * Seeding deletes both demo projects and rewrites them, so it must never point at the database a
 * developer keeps their own work in. The servers below get the same targets through the Playwright
 * config, so the browser and the seed agree on what they are looking at.
 */
export default async function globalSetup() {
  const environment = { ...process.env, ...testTargetEnvironment() }
  assertTestTarget(environment)
  await new Promise<void>((resolve, reject) => {
    const child = spawn("bun", ["run", "db:seed"], {
      cwd: process.cwd(),
      env: environment,
      stdio: "inherit",
    })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Database seed exited with code ${code}.`))
    })
  })
}
