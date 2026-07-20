import { spawn } from "node:child_process"

export default async function globalSetup() {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("bun", ["run", "db:seed"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Database seed exited with code ${code}.`))
    })
  })
}
