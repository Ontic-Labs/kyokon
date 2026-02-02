-- Migration 002: Cookability assessment table
-- Tracks which foods are suitable for recipe/cooking use

CREATE TABLE IF NOT EXISTS fdc_cookability_assessment (
  fdc_id BIGINT PRIMARY KEY REFERENCES foods(fdc_id) ON DELETE CASCADE,

  -- Deterministic veto evidence
  veto_flags TEXT[] NOT NULL DEFAULT '{}',

  -- Threshold used to compute is_cookable (stored for auditability)
  cookability_threshold INT NOT NULL DEFAULT 2,

  -- Derived summary fields (kept for query speed; enforced for consistency)
  veto_score INT NOT NULL DEFAULT 0,
  is_cookable BOOLEAN NOT NULL DEFAULT TRUE,

  -- Metadata
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assessment_version TEXT NOT NULL DEFAULT '1.0.0',

  -- Enforce internal consistency
  CONSTRAINT ck_veto_score_matches_flags
    CHECK (veto_score = cardinality(veto_flags)),

  -- Enforce is_cookable matches the stored threshold and score
  CONSTRAINT ck_is_cookable_matches_threshold
    CHECK (
      is_cookable = (veto_score < cookability_threshold)
    )
);

-- Indexes for filtering
CREATE INDEX IF NOT EXISTS idx_cookability_is_cookable
  ON fdc_cookability_assessment (is_cookable);

CREATE INDEX IF NOT EXISTS idx_cookability_veto_score
  ON fdc_cookability_assessment (veto_score);

-- Fast lookup by veto flag
CREATE INDEX IF NOT EXISTS idx_cookability_veto_flags_gin
  ON fdc_cookability_assessment USING GIN (veto_flags);

-- Comments for documentation
COMMENT ON TABLE fdc_cookability_assessment IS
'Tracks which foods are suitable for recipe/cooking use based on deterministic veto filters (category/lexical/portion/nutrient sanity).';

COMMENT ON COLUMN fdc_cookability_assessment.veto_flags IS
'Array of veto reasons, e.g.: CATEGORY_INFANT, CATEGORY_SUPPLEMENT, LEXICAL_MEDICAL, LEXICAL_SUPPLEMENT, PORTION_NON_COOKING, NUTRIENT_IMPLAUSIBLE.';

COMMENT ON COLUMN fdc_cookability_assessment.cookability_threshold IS
'Threshold applied when computing is_cookable. is_cookable = (veto_score < cookability_threshold).';

COMMENT ON COLUMN fdc_cookability_assessment.veto_score IS
'Derived count of independent vetoes. Must equal cardinality(veto_flags).';

COMMENT ON COLUMN fdc_cookability_assessment.is_cookable IS
'Derived boolean: TRUE if veto_score < cookability_threshold, enforced by check constraint.';
