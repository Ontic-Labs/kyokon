-- Migration 006: Multi-resolution canonical names for foods
-- Stores base and specific canonical names derived deterministically
-- from food descriptions for recipe ingredient matching.
-- Applies to both SR Legacy and Foundation Foods.

CREATE TABLE IF NOT EXISTS food_canonical_names (
  fdc_id BIGINT NOT NULL REFERENCES foods(fdc_id) ON DELETE CASCADE,

  -- multi-resolution identity
  level TEXT NOT NULL CHECK (level IN ('base','specific')),

  canonical_name TEXT NOT NULL,
  canonical_slug TEXT NOT NULL,

  -- debugging / auditability
  removed_tokens TEXT[] NOT NULL DEFAULT '{}',
  kept_tokens TEXT[] NOT NULL DEFAULT '{}',

  -- quick drift detection when re-running backfill
  description_hash TEXT NULL,

  canonical_version TEXT NOT NULL DEFAULT '1.0.0',
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (fdc_id, level)
);

CREATE INDEX IF NOT EXISTS idx_food_canonical_slug
  ON food_canonical_names (level, canonical_slug);

-- Exact lookups by canonical name
CREATE INDEX IF NOT EXISTS idx_food_canonical_name_exact
  ON food_canonical_names (level, canonical_name);

-- pg_trgm already enabled in 001_init.sql
CREATE INDEX IF NOT EXISTS idx_food_canonical_name_trgm
  ON food_canonical_names USING GIN (canonical_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_food_canonical_removed_tokens_gin
  ON food_canonical_names USING GIN (removed_tokens);
