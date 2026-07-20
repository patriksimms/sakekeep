CREATE TABLE "asset_tombstones" (
	"object_key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"submission_id" uuid,
	"question_id" text,
	"kind" text NOT NULL,
	"object_key" text NOT NULL,
	"preview_object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"source_mime_type" text NOT NULL,
	"source_name" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "books" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"settings" jsonb NOT NULL,
	"generated_book" jsonb NOT NULL,
	"source_fingerprint" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"source_fingerprint" text NOT NULL,
	"pdf_object_key" text NOT NULL,
	"report_object_key" text NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "layouts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"schema" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"occasion" text,
	"state" text DEFAULT 'draft' NOT NULL,
	"form_schema" jsonb NOT NULL,
	"form_revision" integer DEFAULT 0 NOT NULL,
	"share_token_hash" text,
	"book_status" text DEFAULT 'not-generated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"sequence" integer NOT NULL,
	"answers" jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layouts" ADD CONSTRAINT "layouts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_project_index" ON "assets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "assets_submission_index" ON "assets" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "exports_project_index" ON "exports" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "layouts_project_position_unique" ON "layouts" USING btree ("project_id","position");--> statement-breakpoint
CREATE INDEX "layouts_project_index" ON "layouts" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_share_token_hash_unique" ON "projects" USING btree ("share_token_hash");--> statement-breakpoint
CREATE INDEX "projects_updated_at_index" ON "projects" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_project_idempotency_unique" ON "submissions" USING btree ("project_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_project_sequence_unique" ON "submissions" USING btree ("project_id","sequence");--> statement-breakpoint
CREATE INDEX "submissions_project_index" ON "submissions" USING btree ("project_id");