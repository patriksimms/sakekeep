import { zipSync } from "fflate"

export interface ZipEntry {
  name: string
  data: Uint8Array
}

/**
 * Bundles export files into a ZIP archive. Entries are stored rather than deflated: PDF
 * and JPEG payloads are already compressed, so deflating a whole book would cost seconds
 * of request time for almost no saving.
 */
export function createZip(entries: ZipEntry[]): Uint8Array {
  return zipSync(Object.fromEntries(entries.map((entry) => [entry.name, entry.data])), { level: 0 })
}

/** Zero-padded, book-ordered entry name such as `page-01.pdf`. */
export function pageEntryName(index: number, total: number, extension: string): string {
  const width = Math.max(2, String(total).length)
  return `page-${String(index + 1).padStart(width, "0")}.${extension}`
}
