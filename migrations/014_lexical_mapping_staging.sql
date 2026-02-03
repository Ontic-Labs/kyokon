-- Migration 014: Lexical mapping staging table
-- Adds a dedicated staging table for v2 winners to avoid overwriting
-- canonical_fdc_membership and to keep run-based isolation.
--
-- CHANGELOG:
-- 2026-02-03 — Red team follow-up:
--   - Added canonical_fdc_membership_staging with run_id scope

CREATE TABLE IF NOT EXISTS canonical_fdc_membership_staging (
  run_id UUID NOT NULL REFERENCES lexical_mapping_runs(run_id),
  ingredient_key TEXT NOT NULL,
  ingredient_text TEXT NOT NULL,
  fdc_id BIGINT,
  score DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('mapped', 'needs_review', 'no_match')),
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  candidate_description TEXT,
  candidate_category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, ingredient_key)
);

CREATE INDEX IF NOT EXISTS idx_cfm_staging_run_status
  ON canonical_fdc_membership_staging(run_id, status);
