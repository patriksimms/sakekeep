CREATE TABLE "submission_edits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"submission_id" uuid NOT NULL,
	"editor_user_id" text NOT NULL,
	"editor_name" text NOT NULL,
	"changes" jsonb NOT NULL,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "submission_edits" ADD CONSTRAINT "submission_edits_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submission_edits_submission_index" ON "submission_edits" USING btree ("submission_id");