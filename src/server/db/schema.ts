import { type Locale } from "#/lib/locale.ts"
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import {
  type ExportReport,
  type FormSchema,
  type GeneratedBook,
  type GenerationSettings,
  type LayoutRole,
  type LayoutSchema,
  type PageFormat,
  type PageOrientation,
  type SubmissionAnswers,
  type SubmissionTextChange,
} from "../../domain/types"

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey(),
    title: text("title").notNull(),
    bookLanguage: text("book_language").$type<Locale>().notNull().default("de"),
    occasion: text("occasion"),
    state: text("state").$type<"draft" | "collecting" | "closed">().notNull().default("draft"),
    formSchema: jsonb("form_schema").$type<FormSchema>().notNull(),
    formRevision: integer("form_revision").notNull().default(0),
    shareTokenHash: text("share_token_hash"),
    bookStatus: text("book_status")
      .$type<"not-generated" | "current" | "stale">()
      .notNull()
      .default("not-generated"),
    pageFormat: text("page_format").$type<PageFormat>().notNull().default("a5"),
    pageOrientation: text("page_orientation")
      .$type<PageOrientation>()
      .notNull()
      .default("landscape"),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("projects_share_token_hash_unique").on(table.shareTokenHash),
    index("projects_updated_at_index").on(table.updatedAt),
    index("projects_archived_at_index").on(table.archivedAt),
  ]
)

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    sequence: integer("sequence").notNull(),
    revision: integer("revision").notNull().default(0),
    answers: jsonb("answers").$type<SubmissionAnswers>().notNull(),
    submittedAt: timestamp("submitted_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("submissions_project_idempotency_unique").on(table.projectId, table.idempotencyKey),
    uniqueIndex("submissions_project_sequence_unique").on(table.projectId, table.sequence),
    index("submissions_project_index").on(table.projectId),
  ]
)

export const submissionEdits = pgTable(
  "submission_edits",
  {
    id: uuid("id").primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    editorUserId: text("editor_user_id").notNull(),
    editorName: text("editor_name").notNull(),
    changes: jsonb("changes").$type<SubmissionTextChange[]>().notNull(),
    editedAt: timestamp("edited_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("submission_edits_submission_index").on(table.submissionId)]
)

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id").references(() => submissions.id, {
      onDelete: "cascade",
    }),
    questionId: text("question_id"),
    kind: text("kind").$type<"submission-image" | "decorative-image">().notNull(),
    objectKey: text("object_key").notNull(),
    previewObjectKey: text("preview_object_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sourceMimeType: text("source_mime_type").notNull(),
    sourceName: text("source_name").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    // Organizer-chosen crop centre, null until someone adjusts this photo. Kept here rather than
    // in the submission answers so the contributor's submitted record stays byte-for-byte as sent.
    focalPoint: jsonb("focal_point").$type<{ x: number; y: number }>(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("assets_project_index").on(table.projectId),
    index("assets_submission_index").on(table.submissionId),
  ]
)

export const layouts = pgTable(
  "layouts",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    revision: integer("revision").notNull().default(0),
    role: text("role").$type<LayoutRole>().notNull().default("submission"),
    schema: jsonb("schema").$type<LayoutSchema>().notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("layouts_project_position_unique").on(table.projectId, table.position),
    // A book has one front and one back cover; the partial indexes keep that true under
    // concurrent writes, alongside the in-transaction check in the repository.
    uniqueIndex("layouts_project_front_cover_unique")
      .on(table.projectId)
      .where(sql`${table.role} = 'front-cover'`),
    uniqueIndex("layouts_project_back_cover_unique")
      .on(table.projectId)
      .where(sql`${table.role} = 'back-cover'`),
    index("layouts_project_index").on(table.projectId),
  ]
)

export const books = pgTable("books", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  settings: jsonb("settings").$type<GenerationSettings>().notNull(),
  generatedBook: jsonb("generated_book").$type<GeneratedBook>().notNull(),
  sourceFingerprint: text("source_fingerprint").notNull(),
  generatedAt: timestamp("generated_at", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  })
    .notNull()
    .defaultNow(),
})

export const exportsTable = pgTable(
  "exports",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceFingerprint: text("source_fingerprint").notNull(),
    pdfObjectKey: text("pdf_object_key").notNull(),
    reportObjectKey: text("report_object_key").notNull(),
    // Null whenever the organizer did not ask for that bundle.
    pagePdfZipObjectKey: text("page_pdf_zip_object_key"),
    pageJpegZipObjectKey: text("page_jpeg_zip_object_key"),
    report: jsonb("report").$type<ExportReport>().notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("exports_project_index").on(table.projectId)]
)

export const assetTombstones = pgTable("asset_tombstones", {
  objectKey: text("object_key").primaryKey(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .notNull()
    .defaultNow(),
  /**
   * When a deleter took this object on. Set while the object store call is in flight and
   * cleared if it fails, so the row survives a crash and stays retryable. A claim older
   * than the lease is treated as abandoned.
   */
  claimedAt: timestamp("claimed_at", {
    withTimezone: true,
    mode: "date",
  }),
})
