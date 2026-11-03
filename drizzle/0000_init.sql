CREATE TABLE "ai_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"key_ciphertext" text NOT NULL,
	"key_hint" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"target_label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"words" text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"owner_id" uuid,
	"active_question_id" uuid,
	"screen_mode" text DEFAULT 'live' NOT NULL,
	"screen_block_id" uuid,
	"qa_enabled" boolean DEFAULT false NOT NULL,
	"qa_moderated" boolean DEFAULT false NOT NULL,
	"results_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"nickname" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "qa_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"participant_id" uuid,
	"text" text NOT NULL,
	"status" text DEFAULT 'visible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qa_votes" (
	"qa_question_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	CONSTRAINT "qa_votes_qa_question_id_participant_id_pk" PRIMARY KEY("qa_question_id","participant_id")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"phase" text NOT NULL,
	"prompt" text NOT NULL,
	"max_words" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"provider" text,
	"role" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aliases" ADD CONSTRAINT "aliases_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_questions" ADD CONSTRAINT "qa_questions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_questions" ADD CONSTRAINT "qa_questions_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_votes" ADD CONSTRAINT "qa_votes_qa_question_id_qa_questions_id_fk" FOREIGN KEY ("qa_question_id") REFERENCES "public"."qa_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_votes" ADD CONSTRAINT "qa_votes_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "aliases_block_key_uq" ON "aliases" USING btree ("block_id","source_key");--> statement-breakpoint
CREATE UNIQUE INDEX "answers_q_p_uq" ON "answers" USING btree ("question_id","participant_id");--> statement-breakpoint
CREATE INDEX "blocks_event_idx" ON "blocks" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "participants_event_idx" ON "participants" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "qa_event_idx" ON "qa_questions" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "questions_block_phase_uq" ON "questions" USING btree ("block_id","phase");