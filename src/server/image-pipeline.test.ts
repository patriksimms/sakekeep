import sharp from "sharp"
import { describe, expect, it } from "vitest"

import { isAcceptedImage, normalizeImage } from "./image-pipeline.ts"

describe("image processing", () => {
  it("normalizes orientation, removes source metadata, and keeps dimensions", async () => {
    const source = await sharp({
      create: {
        width: 40,
        height: 20,
        channels: 3,
        background: "#d97757",
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6, density: 72 })
      .toBuffer()
    const normalized = await normalizeImage(source, "image/jpeg")
    expect(normalized.masterMimeType).toBe("image/jpeg")
    expect(normalized.previewMimeType).toBe("image/webp")
    expect([normalized.width, normalized.height]).toEqual([20, 40])
    const metadata = await sharp(normalized.master).metadata()
    expect(metadata.orientation).toBeUndefined()
    expect(metadata.exif).toBeUndefined()
    expect(normalized.master.byteLength).toBeGreaterThan(0)
    expect(normalized.preview.byteLength).toBeGreaterThan(0)
  })

  it("accepts documented image types and fails corrupt uploads", async () => {
    expect(isAcceptedImage({ name: "photo.heic", type: "" })).toBe(true)
    expect(isAcceptedImage({ name: "photo.exe", type: "application/octet-stream" })).toBe(false)
    await expect(
      normalizeImage(new TextEncoder().encode("not an image"), "image/jpeg")
    ).rejects.toThrow()
  })

  it("preserves a safe embedded RGB profile while normalizing browser previews to sRGB", async () => {
    const source = await sharp({
      create: {
        width: 24,
        height: 16,
        channels: 3,
        background: "#667eea",
      },
    })
      .jpeg()
      .withIccProfile("p3")
      .withMetadata({ orientation: 1 })
      .toBuffer()
    const sourceMetadata = await sharp(source).metadata()

    const normalized = await normalizeImage(source, "image/jpeg")
    const masterMetadata = await sharp(normalized.master).metadata()
    const previewMetadata = await sharp(normalized.preview).metadata()

    expect(sourceMetadata.icc).toBeDefined()
    expect(masterMetadata.icc).toEqual(sourceMetadata.icc)
    expect(masterMetadata.exif).toBeUndefined()
    expect(previewMetadata.icc).toBeDefined()
  })
})
