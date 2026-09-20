import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

/**
 * Everything Git refuses to track is local to one machine, and some of it holds credentials:
 * `.envrc` is the documented place for local environment overrides, `.clerk` keeps Clerk state,
 * and the production dump tooling produces real data. `COPY . .` puts the whole build context
 * into a build stage and its cache, so anything `.dockerignore` misses ends up in an image.
 *
 * This puts a harmless sentinel at each of those paths and asks Docker to build a stage that
 * fails if it can see one. A `.dockerignore` that falls behind `.gitignore` fails here.
 */

const root = resolve(import.meta.dirname, "..")

/** One concrete path per `.gitignore` entry, with globs turned into something we can create. */
function ignoredPaths(): string[] {
  const entries = readFileSync(join(root, ".gitignore"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("!"))
  return [
    ...new Set(
      entries.map((entry) =>
        entry
          .replace(/^\//, "")
          .replace(/\/\*$/, "/sentinel")
          .replace(/\/$/, "")
          .replace(/\*/g, "sentinel")
      )
    ),
  ]
}

const paths = ignoredPaths()
const created: string[] = []
for (const path of paths) {
  const absolute = join(root, path)
  if (existsSync(absolute)) continue
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, "sakekeep build-context sentinel\n")
  created.push(absolute)
}

// A stage that can see any of these fails the build and names the file that leaked.
const probe = `FROM busybox
COPY . /context
RUN set -e; for path in ${paths.map((path) => `"${path}"`).join(" ")}; do \\
      if [ -e "/context/$path" ]; then echo "The build context contains $path."; exit 1; fi; \\
    done
`

// Exiting inside the try would skip the cleanup below and leave the sentinels in the checkout.
let status = 0
try {
  const result = spawnSync("docker", ["build", "--progress=plain", "--file", "-", "."], {
    cwd: root,
    input: probe,
    encoding: "utf8",
  })
  status = result.status ?? 1
  if (status !== 0) {
    process.stderr.write(result.stdout ?? "")
    process.stderr.write(result.stderr ?? "")
  } else {
    console.log(`No Git-ignored path reaches a build stage (${paths.length} checked).`)
  }
} finally {
  for (const absolute of created) rmSync(absolute, { recursive: true, force: true })
}
process.exit(status)
