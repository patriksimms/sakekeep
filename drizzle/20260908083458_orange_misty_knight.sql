CREATE TABLE "project_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by" text,
	"revoked_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "project_invitations_role_check" CHECK ("project_invitations"."role" in ('organizer', 'editor'))
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "project_members_project_id_user_id_pk" PRIMARY KEY("project_id","user_id"),
	CONSTRAINT "project_members_role_check" CHECK ("project_members"."role" in ('organizer', 'editor'))
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "owner_user_id" text;--> statement-breakpoint
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_invitations_token_unique" ON "project_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "project_invitations_project_index" ON "project_invitations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_members_user_index" ON "project_members" USING btree ("user_id");