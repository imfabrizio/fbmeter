ALTER TABLE "answers" ALTER COLUMN "words" SET DEFAULT '{}'::text[];--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "choices" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "scale" integer;--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN "text_value" text;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "type" text DEFAULT 'words' NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "options" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "multiple" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "correct" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "scale_min" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "scale_max" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "scale_min_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "scale_max_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "in_summary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "revealed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "questions_block_idx" ON "questions" USING btree ("block_id","position");--> statement-breakpoint
-- Converte le domande inizio/fine esistenti nel nuovo modello
UPDATE "questions" SET "position" = CASE "phase" WHEN 'pre' THEN 0 ELSE 1 END, "label" = CASE "phase" WHEN 'pre' THEN 'Inizio' ELSE 'Fine' END, "in_summary" = ("phase" = 'post');
