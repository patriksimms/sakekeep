import { inArray } from "drizzle-orm"

import { FORM_SCHEMA_VERSION, LAYOUT_SCHEMA_VERSION } from "../src/domain/types"
import { DEFAULT_TEXT_SETTINGS } from "../src/domain/layout"
import { db, pool } from "../src/server/db"
import { layouts, projects, submissions } from "../src/server/db/schema"
import { ensureBucket, s3 } from "../src/server/object-store"
import { generateProjectBook } from "../src/server/repository"
import { shareTokenForProject, shareTokenHash } from "../src/server/share-token"

const CLOSED_PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const COLLECTING_PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const LAYOUT_ONE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const LAYOUT_TWO_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const createdAt = new Date("2026-01-15T10:00:00.000Z")

const formSchema = {
  version: FORM_SCHEMA_VERSION,
  questions: [
    {
      id: "name",
      type: "single-line" as const,
      prompt: "What should we call you in the book?",
      required: true,
      characterLimit: 60,
      validateUrl: false,
    },
    {
      id: "memory",
      type: "multiline" as const,
      prompt: "Which memory still makes you smile?",
      required: true,
      characterLimit: 800,
    },
    {
      id: "superpower",
      type: "radio" as const,
      prompt: "What is Lea’s secret superpower?",
      required: true,
      choices: [
        { id: "calm", label: "Making chaos feel calm" },
        { id: "laugh", label: "The perfectly timed laugh" },
        { id: "snacks", label: "Always finding snacks" },
      ],
    },
    {
      id: "future",
      type: "checkboxes" as const,
      prompt: "What should the next chapter include?",
      required: false,
      choices: [
        { id: "travel", label: "A little travel" },
        { id: "rest", label: "A lot of rest" },
        { id: "adventure", label: "An unexpected adventure" },
      ],
    },
    {
      id: "photos",
      type: "images" as const,
      prompt: "Add one or two favourite photos",
      required: false,
      maxImages: 2,
    },
  ],
}

await ensureBucket()
await db.delete(projects).where(inArray(projects.id, [CLOSED_PROJECT_ID, COLLECTING_PROJECT_ID]))

await db.insert(projects).values([
  {
    id: CLOSED_PROJECT_ID,
    title: "Lea’s farewell book",
    occasion: "Team farewell · September 2026",
    state: "closed",
    formSchema,
    formRevision: 4,
    shareTokenHash: shareTokenHash(shareTokenForProject(CLOSED_PROJECT_ID)),
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: COLLECTING_PROJECT_ID,
    title: "Mina’s 30th birthday",
    occasion: "Birthday · October 2026",
    state: "collecting",
    formSchema,
    formRevision: 4,
    shareTokenHash: shareTokenHash(shareTokenForProject(COLLECTING_PROJECT_ID)),
    createdAt,
    updatedAt: createdAt,
  },
])

await db.insert(layouts).values([
  {
    id: LAYOUT_ONE_ID,
    projectId: CLOSED_PROJECT_ID,
    name: "Warm quote",
    position: 0,
    schema: {
      version: LAYOUT_SCHEMA_VERSION,
      trim: { widthMm: 210 as const, heightMm: 148 as const },
      bleedMm: 3 as const,
      safeMarginMm: 6 as const,
      background: "#fff9ef",
      elements: [
        {
          id: "warm-panel",
          type: "rectangle" as const,
          geometry: { x: -3, y: -3, width: 78, height: 154, rotation: 0 },
          opacity: 1,
          fill: "#dfe8d8",
          stroke: "#dfe8d8",
          strokeWidth: 0,
        },
        {
          id: "warm-name",
          type: "bound-text" as const,
          geometry: { x: 90, y: 20, width: 105, height: 22, rotation: 0 },
          opacity: 1,
          questionId: "name",
          showLabel: false,
          text: {
            ...DEFAULT_TEXT_SETTINGS,
            fontFamily: "Source Serif 4" as const,
            fontSize: 24,
            minFontSize: 14,
            fontWeight: "bold" as const,
          },
        },
        {
          id: "warm-memory",
          type: "bound-text" as const,
          geometry: { x: 90, y: 49, width: 105, height: 72, rotation: 0 },
          opacity: 1,
          questionId: "memory",
          showLabel: true,
          label: "A memory worth keeping",
          text: {
            ...DEFAULT_TEXT_SETTINGS,
            fontFamily: "Source Serif 4" as const,
            fontSize: 15,
            minFontSize: 8,
            overflow: "shrink" as const,
          },
        },
      ],
    },
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: LAYOUT_TWO_ID,
    projectId: CLOSED_PROJECT_ID,
    name: "Playful note",
    position: 1,
    schema: {
      version: LAYOUT_SCHEMA_VERSION,
      trim: { widthMm: 210 as const, heightMm: 148 as const },
      bleedMm: 3 as const,
      safeMarginMm: 6 as const,
      background: "#f4eee9",
      elements: [
        {
          id: "play-circle",
          type: "circle" as const,
          geometry: { x: 123, y: -3, width: 90, height: 72, rotation: 0 },
          opacity: 1,
          fill: "#ead6bf",
          stroke: "#ead6bf",
          strokeWidth: 0,
        },
        {
          id: "play-title",
          type: "static-text" as const,
          geometry: { x: 16, y: 17, width: 130, height: 24, rotation: 0 },
          opacity: 1,
          content: "You made a difference.",
          text: {
            ...DEFAULT_TEXT_SETTINGS,
            fontFamily: "Source Serif 4" as const,
            fontSize: 25,
            minFontSize: 16,
            fontWeight: "bold" as const,
          },
        },
        {
          id: "play-memory",
          type: "bound-text" as const,
          geometry: { x: 18, y: 54, width: 164, height: 65, rotation: -1 },
          opacity: 1,
          questionId: "memory",
          showLabel: false,
          text: {
            ...DEFAULT_TEXT_SETTINGS,
            fontSize: 16,
            minFontSize: 8,
            overflow: "shrink" as const,
          },
        },
      ],
    },
    createdAt,
    updatedAt: createdAt,
  },
])

await db.insert(submissions).values([
  {
    id: "31111111-1111-4111-8111-111111111111",
    projectId: CLOSED_PROJECT_ID,
    idempotencyKey: "41111111-1111-4111-8111-111111111111",
    sequence: 1,
    answers: {
      name: "Nora",
      memory:
        "That rainy train ride when every connection failed and somehow it became the best afternoon of the trip.",
      superpower: ["calm"],
      future: ["travel", "rest"],
      photos: [],
    },
    submittedAt: new Date("2026-01-16T09:00:00.000Z"),
  },
  {
    id: "32222222-2222-4222-8222-222222222222",
    projectId: CLOSED_PROJECT_ID,
    idempotencyKey: "42222222-2222-4222-8222-222222222222",
    sequence: 2,
    answers: {
      name: "Sam",
      memory:
        "You were the first person to say “we can figure it out” and then actually make everyone believe it.",
      superpower: ["laugh"],
      future: ["adventure"],
      photos: [],
    },
    submittedAt: new Date("2026-01-16T10:00:00.000Z"),
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    projectId: CLOSED_PROJECT_ID,
    idempotencyKey: "43333333-3333-4333-8333-333333333333",
    sequence: 3,
    answers: {
      name: "Jo",
      memory:
        "The kitchen-table brainstorm with too much coffee, terrible sketches, and the idea that finally worked.",
      superpower: ["snacks"],
      future: ["travel", "adventure"],
      photos: [],
    },
    submittedAt: new Date("2026-01-16T11:00:00.000Z"),
  },
])

await generateProjectBook(CLOSED_PROJECT_ID, {
  mode: "cycle",
  seed: "demo-seed",
  manualAssignments: {},
  resolutionOverrides: [],
})

console.log("Seeded deterministic demo projects.")
console.log(
  `Collecting form: http://localhost:3000/s/${shareTokenForProject(COLLECTING_PROJECT_ID)}`
)
await pool.end()
s3.destroy()
