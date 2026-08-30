import { Zip, ZipPassThrough } from "fflate"

export interface ZipEntry {
  name: string
  data: Uint8Array
}

/**
 * Bundles export files into a ZIP archive, pulling one entry at a time and yielding the
 * archive as it grows. Nothing but the entry being written stays resident, so a book-sized
 * bundle never sits in memory beside the pages it was built from.
 *
 * Entries are stored rather than deflated: PDF and JPEG payloads are already compressed,
 * so deflating a whole book would cost seconds of request time for almost no saving.
 */
export async function* zipEntries(entries: AsyncIterable<ZipEntry>): AsyncGenerator<Uint8Array> {
  const chunks: Uint8Array[] = []
  let failure: Error | undefined
  const archive = new Zip((error, chunk) => {
    if (error) failure ??= error
    else if (chunk.length > 0) chunks.push(chunk)
  })
  const drain = () => {
    if (failure) throw failure
    return chunks.splice(0)
  }
  for await (const entry of entries) {
    const file = new ZipPassThrough(entry.name)
    archive.add(file)
    // A pass-through entry emits synchronously, so the entry is fully handed to the
    // consumer before the producer is asked for the next page.
    file.push(entry.data, true)
    yield* drain()
  }
  archive.end()
  yield* drain()
}

/** Zero-padded, book-ordered entry name such as `page-01.pdf`. */
export function pageEntryName(index: number, total: number, extension: string): string {
  const width = Math.max(2, String(total).length)
  return `page-${String(index + 1).padStart(width, "0")}.${extension}`
}
