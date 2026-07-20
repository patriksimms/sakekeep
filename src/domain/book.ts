import { z } from "zod"

const problemSchema = z.object({
  id: z.string().min(1),
  code: z.union([
    z.literal("text-overflow"),
    z.literal("image-low-resolution"),
    z.literal("image-blocking-resolution"),
    z.literal("unsupported-asset"),
    z.literal("gallery-overflow"),
    z.literal("outside-print-area"),
    z.literal("missing-required-answer"),
  ]),
  pageId: z.string().min(1),
  elementId: z.string().optional(),
  assetId: z.string().optional(),
  message: z.string().min(1),
  blocking: z.boolean(),
})

export const generationSettingsValidator = z.object({
  mode: z.union([z.literal("cycle"), z.literal("seeded-random"), z.literal("manual")]),
  seed: z.string().min(1).max(200),
  manualAssignments: z.record(z.string(), z.string()),
  resolutionOverrides: z.array(z.string()).max(10_000),
})

export const bookPageValidator = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().min(1),
    kind: z.literal("submission"),
    submissionId: z.string().uuid(),
    layoutId: z.string().uuid(),
    problems: z.array(problemSchema),
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal("standalone"),
    pageType: z.union([
      z.literal("cover"),
      z.literal("introduction"),
      z.literal("closing"),
      z.literal("blank"),
    ]),
    title: z.string().max(500),
    body: z.string().max(100_000),
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    problems: z.array(problemSchema),
  }),
])
