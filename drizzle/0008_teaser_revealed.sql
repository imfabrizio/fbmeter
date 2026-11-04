ALTER TABLE "events" ADD COLUMN "teaser_revealed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "events" SET "teaser_revealed" = true
WHERE "teaser_block_id" IS NOT NULL
  AND ("results_published" = true OR "screen_mode" IN ('strips', 'crown') OR ("screen_mode" = 'reveal' AND "screen_block_id" = "teaser_block_id"));
