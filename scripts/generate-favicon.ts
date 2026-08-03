import { readFileSync, writeFileSync } from "node:fs"

import sharp from "sharp"

const svg = readFileSync(new URL("../public/favicon.svg", import.meta.url))

// At 16/24px the heart cutout muddies into the bookmark, so the smallest ICO
// entries drop it.
const simpleSvg = Buffer.from(
  svg
    .toString()
    .replace(/<path\s+d="M32 34\.6[\s\S]*?\/>/, "")
)

async function png(size: number, source: Buffer = svg): Promise<Buffer> {
  return sharp(source, { density: (72 * size) / 64 })
    .resize(size, size)
    .png()
    .toBuffer()
}

// ICO container: 6-byte header, one 16-byte directory entry per image,
// then the raw PNG payloads.
function buildIco(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  const entries: Buffer[] = []
  let offset = 6 + 16 * images.length
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += data.length
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
}

const icoSizes = [16, 24, 32, 64]
const icoImages = await Promise.all(
  icoSizes.map(async (size) => ({
    size,
    data: await png(size, size < 32 ? simpleSvg : svg),
  }))
)
writeFileSync(new URL("../public/favicon.ico", import.meta.url), buildIco(icoImages))

for (const size of [192, 512]) {
  writeFileSync(new URL(`../public/logo${size}.png`, import.meta.url), await png(size))
}

console.log("Wrote favicon.ico, logo192.png, logo512.png from favicon.svg")
