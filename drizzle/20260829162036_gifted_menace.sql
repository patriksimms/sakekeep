ALTER TABLE "layouts" ADD COLUMN "role" text DEFAULT 'submission' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "layouts_project_front_cover_unique" ON "layouts" USING btree ("project_id") WHERE "layouts"."role" = 'front-cover';--> statement-breakpoint
CREATE UNIQUE INDEX "layouts_project_back_cover_unique" ON "layouts" USING btree ("project_id") WHERE "layouts"."role" = 'back-cover';