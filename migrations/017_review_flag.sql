-- Migration 017: Add review_flag column for visual triage
-- Stores ⚠️ for needs_review rows so they're immediately identifiable
-- in queries, dashboards, and exports.

ALTER TABLE canonical_fdc_membership_staging
  ADD COLUMN IF NOT EXISTS review_flag TEXT;

ALTER TABLE canonical_fdc_membership
  ADD COLUMN IF NOT EXISTS review_flag TEXT;

-- Backfill any existing rows based on status
UPDATE canonical_fdc_membership_staging
  SET review_flag = '⚠️'
  WHERE status = 'needs_review' AND review_flag IS NULL;

UPDATE canonical_fdc_membership
  SET review_flag = '⚠️'
  WHERE status = 'needs_review' AND review_flag IS NULL;
