import { z } from "zod"

import { type UploadedImageDescriptor, validateSubmission } from "../domain/form"
import { type SubmissionAnswers } from "../domain/types"
import { HttpError } from "./http"
import { isAcceptedImage, normalizeImage } from "./image-pipeline"
import { deleteObjects, putObject } from "./object-store"
import {
  createSubmissionRecord,
  findPublicProject,
  findSubmissionByIdempotency,
  type PendingAsset,
} from "./repository"

const payloadSchema = z.object({
  idempotencyKey: z.string().uuid(),
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
})

interface ParsedUpload {
  descriptor: UploadedImageDescriptor
  file: File
}

function parseUploadFieldName(value: string): {
  questionId: string
  index: number
} | null {
  const match = /^file:([^:]+):(\d+)$/.exec(value)
  if (!match) return null
  return { questionId: match[1]!, index: Number(match[2]) }
}

export async function submitContribution(
  token: string,
  request: Request
): Promise<{ id: string; created: boolean }> {
  const publicProject = await findPublicProject(token)
  if (publicProject.status === "unknown") {
    throw new HttpError(404, "This share link is unknown or malformed.")
  }
  if (publicProject.status === "closed") {
    throw new HttpError(409, "Collection is closed. This response was not saved.")
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    throw new HttpError(400, "The submission must use multipart form data.")
  }
  const rawPayload = formData.get("payload")
  if (typeof rawPayload !== "string") {
    throw new HttpError(400, "Submission payload is missing.")
  }
  let payload: z.infer<typeof payloadSchema>
  try {
    payload = payloadSchema.parse(JSON.parse(rawPayload))
  } catch {
    throw new HttpError(400, "Submission payload is invalid.")
  }

  const existing = await findSubmissionByIdempotency(
    publicProject.projectId,
    payload.idempotencyKey
  )
  if (existing) return { id: existing.id, created: false }

  const uploads: ParsedUpload[] = []
  for (const [name, rawValue] of formData.entries() as IterableIterator<[string, string | Blob]>) {
    if (typeof rawValue === "string" || name === "payload") continue
    const value = rawValue as File
    const parsed = parseUploadFieldName(name)
    if (!parsed) {
      throw new HttpError(400, "An image upload field is malformed.")
    }
    uploads.push({
      descriptor: {
        ...parsed,
        name: value.name,
        mimeType: value.type,
        sizeBytes: value.size,
      },
      file: value,
    })
  }
  uploads.sort(
    (left, right) =>
      left.descriptor.questionId.localeCompare(right.descriptor.questionId) ||
      left.descriptor.index - right.descriptor.index
  )

  const answers = payload.answers as SubmissionAnswers
  const issues = validateSubmission(
    publicProject.formSchema,
    answers,
    uploads.map((upload) => upload.descriptor)
  )
  if (issues.length > 0) {
    throw new HttpError(422, "Resolve the response errors and try again.", {
      issues,
    })
  }

  const pendingAssets: PendingAsset[] = []
  const uploadedKeys: string[] = []
  try {
    for (const upload of uploads) {
      if (!isAcceptedImage(upload.file)) {
        throw new HttpError(422, `${upload.file.name} is not a supported image.`)
      }
      const bytes = new Uint8Array(await upload.file.arrayBuffer())
      const normalized = await normalizeImage(bytes, upload.file.type)
      const id = crypto.randomUUID()
      const extension = normalized.masterMimeType === "image/png" ? "png" : "jpg"
      const objectKey = `projects/${publicProject.projectId}/submissions/pending/${payload.idempotencyKey}/${id}/master.${extension}`
      const previewObjectKey = `projects/${publicProject.projectId}/submissions/pending/${payload.idempotencyKey}/${id}/preview.webp`
      await putObject({
        key: objectKey,
        body: normalized.master,
        contentType: normalized.masterMimeType,
      })
      uploadedKeys.push(objectKey)
      await putObject({
        key: previewObjectKey,
        body: normalized.preview,
        contentType: normalized.previewMimeType,
      })
      uploadedKeys.push(previewObjectKey)
      pendingAssets.push({
        id,
        questionId: upload.descriptor.questionId,
        objectKey,
        previewObjectKey,
        masterMimeType: normalized.masterMimeType,
        sourceMimeType: upload.file.type,
        sourceName: upload.file.name,
        sizeBytes: upload.file.size,
        width: normalized.width,
        height: normalized.height,
      })
    }

    const result = await createSubmissionRecord({
      projectId: publicProject.projectId,
      idempotencyKey: payload.idempotencyKey,
      answers,
      pendingAssets,
    })
    if (!result.created) {
      await deleteObjects(uploadedKeys)
    }
    return { id: result.submission.id, created: result.created }
  } catch (error) {
    await deleteObjects(uploadedKeys)
    if (error instanceof HttpError) throw error
    throw new HttpError(422, "One or more images could not be processed. No response was saved.")
  }
}
