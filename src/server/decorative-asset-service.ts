import { HttpError } from "./http"
import { isAcceptedImage, normalizeImage } from "./image-pipeline"
import { deleteObjects, putObject } from "./object-store"
import { createDecorativeAssetRecord } from "./repository"

export async function uploadDecorativeAsset(projectId: string, request: Request) {
  const data = await request.formData()
  const raw = data.get("file")
  if (!raw || typeof raw === "string") {
    throw new HttpError(400, "Choose one decorative image.")
  }
  const file = raw as File
  if (!isAcceptedImage(file)) {
    throw new HttpError(422, "Decorative images must be JPEG, PNG, WebP, HEIF, or HEIC.")
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new HttpError(422, "The source image must be no larger than 15 MB.")
  }
  const id = crypto.randomUUID()
  const keys: string[] = []
  try {
    const normalized = await normalizeImage(new Uint8Array(await file.arrayBuffer()), file.type)
    const extension = normalized.masterMimeType === "image/png" ? "png" : "jpg"
    const objectKey = `projects/${projectId}/decorative/${id}/master.${extension}`
    const previewObjectKey = `projects/${projectId}/decorative/${id}/preview.webp`
    await putObject({
      key: objectKey,
      body: normalized.master,
      contentType: normalized.masterMimeType,
    })
    keys.push(objectKey)
    await putObject({
      key: previewObjectKey,
      body: normalized.preview,
      contentType: normalized.previewMimeType,
    })
    keys.push(previewObjectKey)
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
    await deleteObjects(keys)
    if (error instanceof HttpError) throw error
    throw new HttpError(422, "The decorative image could not be processed.")
  }
}
