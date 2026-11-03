ALTER TABLE "blocks" ADD COLUMN "reveal" jsonb;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "teaser_block_id" uuid;