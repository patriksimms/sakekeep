import { Readable } from "node:stream"

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { Upload } from "@aws-sdk/lib-storage"

import { env } from "./env"

const configuration = env()

const globalForS3 = globalThis as unknown as {
  sakekeepS3?: S3Client
}

export const s3 =
  globalForS3.sakekeepS3 ??
  new S3Client({
    endpoint: configuration.S3_ENDPOINT,
    region: configuration.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: configuration.S3_ACCESS_KEY_ID,
      secretAccessKey: configuration.S3_SECRET_ACCESS_KEY,
    },
  })

if (process.env.NODE_ENV !== "production") {
  globalForS3.sakekeepS3 = s3
}

let bucketReady: Promise<void> | undefined

export async function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: configuration.S3_BUCKET }))
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: configuration.S3_BUCKET }))
    }
  })()
  try {
    await bucketReady
  } catch (error) {
    bucketReady = undefined
    throw error
  }
}

export async function checkObjectStore(): Promise<void> {
  await ensureBucket()
  await s3.send(new HeadBucketCommand({ Bucket: configuration.S3_BUCKET }))
}

export async function putObject(input: {
  key: string
  body: Uint8Array
  contentType: string
}): Promise<void> {
  await ensureBucket()
  await s3.send(
    new PutObjectCommand({
      Bucket: configuration.S3_BUCKET,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    })
  )
}

/** One part at a time, so a streamed body costs a part of memory rather than its full size. */
const UPLOAD_PART_BYTES = 8 * 1024 * 1024

/**
 * Uploads a body that is produced as it goes, without ever holding it whole. Used for the
 * per-page export bundles, whose size grows with the page count of the book.
 */
export async function putObjectStream(input: {
  key: string
  body: AsyncIterable<Uint8Array>
  contentType: string
}): Promise<void> {
  await ensureBucket()
  await new Upload({
    client: s3,
    queueSize: 1,
    partSize: UPLOAD_PART_BYTES,
    params: {
      Bucket: configuration.S3_BUCKET,
      Key: input.key,
      Body: Readable.from(input.body),
      ContentType: input.contentType,
    },
  }).done()
}

export async function getObject(key: string): Promise<{
  body: Uint8Array
  contentType: string
}> {
  await ensureBucket()
  const response = await s3.send(
    new GetObjectCommand({ Bucket: configuration.S3_BUCKET, Key: key })
  )
  if (!response.Body) throw new Error(`Object ${key} has no body.`)
  return {
    body: await response.Body.transformToByteArray(),
    contentType: response.ContentType ?? "application/octet-stream",
  }
}

export async function deleteObject(key: string): Promise<void> {
  await ensureBucket()
  await s3.send(new DeleteObjectCommand({ Bucket: configuration.S3_BUCKET, Key: key }))
}

export async function deleteObjects(keys: string[]): Promise<string[]> {
  const failed: string[] = []
  await Promise.all(
    keys.map(async (key) => {
      try {
        await deleteObject(key)
      } catch {
        failed.push(key)
      }
    })
  )
  return failed
}
