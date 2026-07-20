import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

const destination = resolve(".local/icc/PSOcoated_v3.icc")
const expectedMd5 = "2ecf5bdfbd55f6725d15a668afde8a00"
const source = "https://registry.color.org/profile-registry/profiles/PSOcoated_v3.icc"

function md5(bytes: Uint8Array): string {
  return createHash("md5").update(bytes).digest("hex")
}

try {
  const existing = await readFile(destination)
  if (md5(existing) === expectedMd5) {
    console.log(`ICC profile already verified at ${destination}`)
    process.exit(0)
  }
} catch {
  // The verified profile is fetched below.
}

const response = await fetch(source)
if (!response.ok) {
  throw new Error(`Could not download PSO Coated v3: HTTP ${response.status}`)
}
const profile = new Uint8Array(await response.arrayBuffer())
const digest = md5(profile)
if (digest !== expectedMd5) {
  throw new Error(`PSO Coated v3 checksum mismatch: expected ${expectedMd5}, received ${digest}`)
}
await mkdir(dirname(destination), { recursive: true })
await writeFile(destination, profile)
console.log(`Downloaded and verified PSO Coated v3 at ${destination}`)
