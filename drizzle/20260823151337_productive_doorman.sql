ALTER TABLE "projects" ADD COLUMN "page_format" text DEFAULT 'a5' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "page_orientation" text DEFAULT 'landscape' NOT NULL;