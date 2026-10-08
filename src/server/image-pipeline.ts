import * as m from "#/paraglide/messages.js"
import decodeHeic from "heic-decode"
import { crc32, deflateSync } from "node:zlib"
import sharp from "sharp"

import { acceptedImageExtensions, acceptedImageMimeTypes } from "../domain/form"

const PIXEL_LIMIT = 200_000_000

export interface NormalizedImage {
  master: Uint8Array
  preview: Uint8Array
  masterMimeType: "image/jpeg" | "image/png"
  previewMimeType: "image/webp"
  width: number
  height: number
}

export function isAcceptedImage(file: { name: string; type: string }): boolean {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? ""
  return (
    acceptedImageMimeTypes.has(file.type.toLowerCase()) || acceptedImageExtensions.has(extension)
  )
}

// sharp can attach a profile only by converting the pixels into it. These pixels are already in
// the photo's own colour space, so the profile goes into the PNG unchanged.
function withIccProfileChunk(png: Buffer, icc: Buffer): Buffer {
  const type = Buffer.from("iCCP", "latin1")
  const data = Buffer.concat([Buffer.from("icc\0\0", "latin1"), deflateSync(icc)])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])))
  const afterHeader = 8 + 25
  return Buffer.concat([
    png.subarray(0, afterHeader),
    length,
    type,
    data,
    checksum,
    png.subarray(afterHeader),
  ])
}

/**
 * iPhones save photos as HEVC-coded HEIC. The prebuilt sharp binaries read their metadata but
 * cannot decode the pixels, so every such photo failed the submission. libheif's WebAssembly build
 * decodes them instead, and a lossless PNG with the photo's own profile hands them to the normal
 * pipeline.
 */
async function decodeHevcHeic(source: Uint8Array, icc: Buffer | undefined): Promise<Uint8Array> {
  const { width, height, data } = await decodeHeic({ buffer: source })
  const png = await sharp(data, { raw: { width, height, channels: 4 } })
    .removeAlpha()
    .png({ compressionLevel: 0 })
    .toBuffer()
  return icc ? withIccProfileChunk(png, icc) : png
}

export async function normalizeImage(
  source: Uint8Array,
  sourceMimeType: string
): Promise<NormalizedImage> {
  const inputOptions = {
    failOn: "error",
    limitInputPixels: PIXEL_LIMIT,
  } as const
  const sourceMetadata = await sharp(source, inputOptions).metadata()
  if (sourceMetadata.format === "heif" && sourceMetadata.compression === "hevc") {
    if ((sourceMetadata.width ?? 0) * (sourceMetadata.height ?? 0) > PIXEL_LIMIT) {
      throw new Error("The HEIC image exceeds the pixel limit.")
    }
    source = await decodeHevcHeic(source, sourceMetadata.icc)
  }
  const preserveSourceProfile = sourceMetadata.icc !== undefined && sourceMetadata.space !== "cmyk"
  const oriented = sharp(source, inputOptions).rotate()

  const metadata = await oriented.metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error(m.ui_the_image_has_no_usable_dimensions())
  }

  const hasAlpha = metadata.hasAlpha === true
  const keepPng = sourceMimeType === "image/png" || hasAlpha
  const masterPipeline = preserveSourceProfile
    ? oriented.clone().keepIccProfile()
    : oriented.clone().withIccProfile("srgb")
  const master = keepPng
    ? await masterPipeline.png({ compressionLevel: 6, adaptiveFiltering: true }).toBuffer()
    : await masterPipeline
        .jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true })
        .toBuffer()

  const preview = await oriented
    .clone()
    .withIccProfile("srgb")
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82, effort: 5 })
    .toBuffer()

  const normalizedMetadata = await sharp(master).metadata()
  return {
    master,
    preview,
    masterMimeType: keepPng ? "image/png" : "image/jpeg",
    previewMimeType: "image/webp",
    width: normalizedMetadata.width ?? metadata.width,
    height: normalizedMetadata.height ?? metadata.height,
  }
}
