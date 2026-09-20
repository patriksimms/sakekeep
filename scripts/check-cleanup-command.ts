import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

/**
 * The deployment runbook tells operators to run the storage cleanup inside the running
 * application container. That only works if the runtime image actually ships something the
 * command can execute, which it did not: the command ran a source file the runtime stage
 * never copied.
 *
 * This check runs the documented command against exactly the file set the runtime stage
 * contains, in a directory of its own. A dependency the image does not carry fails here
 * rather than the first time someone schedules the cleanup in production.
 */

const root = resolve(import.meta.dirname, "..")
const dockerfile = readFileSync(join(root, "Dockerfile"), "utf8")
const runbook = readFileSync(join(root, "docs/DEPLOYMENT.md"), "utf8")
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>
  dependencies: Record<string, string>
}

/** Everything the runtime stage puts into the image, as paths relative to /app. */
function runtimeImageContents(): string[] {
  const runtimeStage = dockerfile.split(/^FROM .* AS runtime$/m)[1]
  assert.ok(runtimeStage, "The Dockerfile has no runtime stage.")
  const inApp = (path: string) => path.replace(/^\.\//, "").replace(/\/$/, "")
  return [...runtimeStage.matchAll(/^COPY (.*)$/gm)].flatMap((line) => {
    const words = line[1]!.split(/\s+/).filter((word) => !word.startsWith("--"))
    const destination = inApp(words.at(-1)!)
    // A single source keeps the name the destination gives it; several sources land inside
    // the destination directory under their own file names.
    const sources = words.slice(0, -1)
    return sources.length === 1
      ? [destination]
      : sources.map((source) => join(destination, source.split("/").at(-1)!))
  })
}

/** The cleanup command the runbook tells operators to run, without its docker wrapper. */
function documentedCleanupCommand(): string[] {
  const line = runbook
    .split("\n")
    .find((candidate) => candidate.includes("storage:cleanup") || candidate.includes("cleanup.js"))
  assert.ok(line, "The deployment runbook documents no storage cleanup command.")
  const words = line.trim().split(/\s+/)
  const inContainer = words.slice(words.indexOf("app") + 1)
  assert.ok(inContainer.length > 0, `Could not read a command out of: ${line}`)
  return inContainer
}

const command = documentedCleanupCommand()
const script = command[0] === "bun" && command[1] === "run" ? command[2]! : null
assert.ok(script, `The documented cleanup command is not a bun script: ${command.join(" ")}`)

const entry = manifest.scripts[script]?.replace(/^bun run /, "") ?? script
const contents = runtimeImageContents()
assert.ok(
  contents.some((item) => entry === item || entry.startsWith(`${item}/`)),
  `The runtime image does not ship ${entry}, which "${command.join(" ")}" runs.`
)

// Everything the bundle leaves external has to come from the production dependency install.
const bundle = readFileSync(join(root, entry), "utf8")
for (const match of bundle.matchAll(/(?:from|require\()\s*["']([^"'.][^"']*)["']/g)) {
  const specifier = match[1]!
  if (specifier.startsWith("node:") || specifier.startsWith("#/")) continue
  const name = specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0]!
  assert.ok(
    manifest.dependencies[name],
    `${entry} imports ${name}, which is not a production dependency and so is absent from the image.`
  )
}

// Run it against the file set the image has, and nothing else.
const isolated = mkdtempSync(join(tmpdir(), "sakekeep-image-"))
try {
  for (const item of contents) {
    const source = join(root, item)
    if (!existsSync(source)) continue
    const destination = join(isolated, item)
    cpSync(source, destination, { recursive: true, dereference: false, verbatimSymlinks: true })
    assert.ok(dirname(destination))
  }
  const result = spawnSync("bun", command.slice(1), {
    cwd: isolated,
    encoding: "utf8",
    env: process.env,
  })
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "")
    process.stderr.write(result.stderr ?? "")
    throw new Error(`"${command.join(" ")}" failed inside the runtime image file set.`)
  }
  assert.match(result.stdout, /orphaned object/)
  console.log(`"${command.join(" ")}" runs against the runtime image file set.`)
} finally {
  rmSync(isolated, { recursive: true, force: true })
}
