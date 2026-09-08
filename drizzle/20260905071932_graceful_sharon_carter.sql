ALTER TABLE "projects" ADD COLUMN "book_language" text DEFAULT 'en' NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "book_language" SET DEFAULT 'de';
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_book_language_check" CHECK ("book_language" IN ('de', 'en'));
