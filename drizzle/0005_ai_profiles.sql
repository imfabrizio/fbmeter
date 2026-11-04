CREATE TABLE "ai_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"key_ciphertext" text NOT NULL,
	"key_hint" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"last_test_ok" boolean,
	"last_test_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_profiles" ADD CONSTRAINT "ai_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_profiles_user_idx" ON "ai_profiles" USING btree ("user_id");--> statement-breakpoint
INSERT INTO "ai_profiles" ("user_id", "label", "provider", "model", "key_ciphertext", "key_hint", "is_default", "created_at", "updated_at")
SELECT "user_id",
  CASE "provider" WHEN 'anthropic' THEN 'Claude' WHEN 'google' THEN 'Gemini' WHEN 'openai' THEN 'OpenAI' ELSE "provider" END,
  "provider", "model", "key_ciphertext", "key_hint", true, "updated_at", "updated_at"
FROM "ai_settings";
