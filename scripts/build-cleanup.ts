import { rm } from "node:fs/promises"

import manifest from "../package.json" with { type: "json" }

/**
 * Bundles the storage cleanup into a single file the runtime image can run. The image ships
 * `dist` and the production `node_modules` and nothing else, so everything from `src` has to
 * be inlined while the installed packages stay external.
 *
 * The external list comes from the production dependencies, so a cleanup that starts using a
 * dev-only package fails the build rather than the deployment.
 */
const outfile = "dist/cleanup.js"
await rm(outfile, { force: true })

const result = await Bun.build({
  entrypoints: ["scripts/cleanup-orphans.ts"],
  target: "bun",
  external: Object.keys(manifest.dependencies),
  outdir: "dist",
  naming: "cleanup.js",
})
if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}
console.log(`Bundled ${outfile}.`)
