-- Migration: Extend escalations and health_workers for Hermes Track 2 Doctor Queue
-- Date: 2026-07-23

ALTER TABLE "escalations" ADD COLUMN IF NOT EXISTS "ai_summary" text;
ALTER TABLE "escalations" ADD COLUMN IF NOT EXISTS "ai_suggested_action" text;
ALTER TABLE "escalations" ADD COLUMN IF NOT EXISTS "guideline_citations" jsonb;
ALTER TABLE "escalations" ADD COLUMN IF NOT EXISTS "reviewed_by" text REFERENCES "health_workers"("id");
ALTER TABLE "escalations" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp;
ALTER TABLE "escalations" ADD COLUMN IF NOT EXISTS "review_notes" text;

-- Update comment for role column in health_workers to reflect doctor role: 'hw' | 'admin' | 'doctor'
COMMENT ON COLUMN "health_workers"."role" IS 'Role of user: hw, admin, doctor';
