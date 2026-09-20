import * as m from "#/paraglide/messages.js"
import { HttpError } from "./http"
import { isAcceptedImage, normalizeImage } from "./image-pipeline"
import { putObject } from "./object-store"
import { createDecorativeAssetRecord, discardReservedObjects, reserveObjects } from "./repository"

export async function uploadDecorativeAsset(projectId: string, request: Request) {
  const data = await request.formData()
  const raw = data.get("file")
  if (!raw || typeof raw === "string") {
    throw new HttpError(400, m.ui_choose_one_decorative_image())
  }
  const file = raw as File
  if (!isAcceptedImage(file)) {
    throw new HttpError(422, m.ui_decorative_images_must_be_jpeg_png_webp_heif_or_heic())
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new HttpError(422, m.ui_the_source_image_must_be_no_larger_than_15_mb())
  }
  const id = crypto.randomUUID()
  const keys: string[] = []
  try {
    const normalized = await normalizeImage(new Uint8Array(await file.arrayBuffer()), file.type)
    const extension = normalized.masterMimeType === "image/png" ? "png" : "jpg"
    const objectKey = `projects/${projectId}/decorative/${id}/master.${extension}`
    const previewObjectKey = `projects/${projectId}/decorative/${id}/preview.webp`
    // Claim the keys as removable before writing: only the asset row makes these objects
    // discoverable, so anything that fails before it exists must leave the sweep a trail.
    await reserveObjects([objectKey, previewObjectKey])
    keys.push(objectKey, previewObjectKey)
    await putObject({
      key: objectKey,
      body: normalized.master,
      contentType: normalized.masterMimeType,
    })
    await putObject({
      key: previewObjectKey,
      body: normalized.preview,
      contentType: normalized.previewMimeType,
    })
    const record = await createDecorativeAssetRecord({
      id,
      projectId,
      objectKey,
      previewObjectKey,
      masterMimeType: normalized.masterMimeType,
      sourceMimeType: file.type,
      sourceName: file.name,
      sizeBytes: file.size,
      width: normalized.width,
      height: normalized.height,
    })
    return {
      id: record.id,
      name: record.sourceName,
      width: record.width,
      height: record.height,
      previewUrl: `/api/assets/${record.id}?variant=preview`,
    }
  } catch (error) {
    await discardReservedObjects(keys)
    if (error instanceof HttpError) throw error
    throw new HttpError(422, m.ui_the_decorative_image_could_not_be_processed())
  }
}
