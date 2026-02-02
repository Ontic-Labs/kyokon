-- Migration 003: Fix veto_score and is_cookable constraints
--
-- 1. veto_score counts DISTINCT veto GROUPS (CATEGORY, LEXICAL, PORTION, NUTRIENT),
--    not individual flags. A food can have multiple flags from the same group
--    (e.g. LEXICAL_SUPPLEMENT + LEXICAL_MEDICAL), so veto_score <= cardinality(veto_flags).
--
-- 2. is_cookable can now be FALSE even when veto_score < threshold, because some
--    flags (e.g. CATEGORY_NON_COOKING) trigger a hard veto regardless of score.
--    The old constraint (is_cookable = veto_score < threshold) is too strict.

ALTER TABLE fdc_cookability_assessment
  DROP CONSTRAINT IF EXISTS ck_veto_score_matches_flags;

ALTER TABLE fdc_cookability_assessment
  ADD CONSTRAINT ck_veto_score_matches_flags
    CHECK (veto_score >= 0 AND veto_score <= cardinality(veto_flags));

-- Relax is_cookable constraint: if score >= threshold, is_cookable MUST be false.
-- But is_cookable can also be false for other reasons (hard vetoes).
ALTER TABLE fdc_cookability_assessment
  DROP CONSTRAINT IF EXISTS ck_is_cookable_matches_threshold;

ALTER TABLE fdc_cookability_assessment
  ADD CONSTRAINT ck_is_cookable_matches_threshold
    CHECK (
      (veto_score >= cookability_threshold AND is_cookable = FALSE)
      OR
      (veto_score < cookability_threshold)
    );

COMMENT ON COLUMN fdc_cookability_assessment.veto_score IS
'Count of distinct veto groups (CATEGORY/LEXICAL/PORTION/NUTRIENT) that fired. Always <= cardinality(veto_flags).';

COMMENT ON COLUMN fdc_cookability_assessment.is_cookable IS
'FALSE if veto_score >= cookability_threshold OR if any hard-veto flag is present (e.g. CATEGORY_NON_COOKING).';
