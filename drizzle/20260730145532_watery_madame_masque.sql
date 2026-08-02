ALTER TABLE "projects" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "projects_archived_at_index" ON "projects" USING btree ("archived_at");