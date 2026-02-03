-- Migration 012: Lexical mapping run tracking
-- Adds run-based staging + promotion for recipe-ingredient mapping.

-- Run tracking table
CREATE TABLE IF NOT EXISTS lexical_mapping_runs (
  run_id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  git_sha TEXT,
  config_json JSONB NOT NULL,
  tokenizer_hash TEXT NOT NULL,
  idf_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('staging', 'validated', 'promoted', 'failed')),
  total_ingredients INT,
  mapped_count INT,
  needs_review_count INT,
  no_match_count INT,
  notes TEXT
);

-- Current pointer (single-row, instant rollback)
CREATE TABLE IF NOT EXISTS lexical_mapping_current (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  current_run_id UUID REFERENCES lexical_mapping_runs(run_id),
  promoted_at TIMESTAMPTZ
);

INSERT INTO lexical_mapping_current (id)
VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;

-- Add run_id to canonical_fdc_membership
-- Existing rows get NULL run_id (pre-v2 data)
ALTER TABLE canonical_fdc_membership
  ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES lexical_mapping_runs(run_id),
  ADD COLUMN IF NOT EXISTS score DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('mapped', 'needs_review', 'no_match')),
  ADD COLUMN IF NOT EXISTS reason_codes TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS candidate_description TEXT,
  ADD COLUMN IF NOT EXISTS candidate_category TEXT;

CREATE INDEX IF NOT EXISTS idx_cfm_run_status
  ON canonical_fdc_membership(run_id, status);

-- Optional: breakdown JSON for audit
CREATE TABLE IF NOT EXISTS canonical_fdc_membership_breakdowns (
  run_id UUID NOT NULL REFERENCES lexical_mapping_runs(run_id),
  ingredient_key TEXT NOT NULL,
  fdc_id BIGINT,
  breakdown_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, ingredient_key)
);

-- Optional: near ties for audit
CREATE TABLE IF NOT EXISTS canonical_fdc_membership_candidates (
  run_id UUID NOT NULL REFERENCES lexical_mapping_runs(run_id),
  ingredient_key TEXT NOT NULL,
  fdc_id BIGINT NOT NULL,
  score DOUBLE PRECISION NOT NULL,
  rank INT NOT NULL,
  PRIMARY KEY (run_id, ingredient_key, fdc_id)
);
