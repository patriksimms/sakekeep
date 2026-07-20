import sharp from "sharp"

import { acceptedImageExtensions, acceptedImageMimeTypes } from "../domain/form"

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

export async function normalizeImage(
  source: Uint8Array,
  sourceMimeType: string
): Promise<NormalizedImage> {
  const inputOptions = {
    failOn: "error",
    limitInputPixels: 200_000_000,
  } as const
  const sourceMetadata = await sharp(source, inputOptions).metadata()
  const preserveSourceProfile = sourceMetadata.icc !== undefined && sourceMetadata.space !== "cmyk"
  const oriented = sharp(source, inputOptions).rotate()

  const metadata = await oriented.metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error("The image has no usable dimensions.")
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
