-- Migration 016: Recipe ingredient methods junction
-- Links Food.com ingredients to canonical mappings + inferred cooking methods

BEGIN;

-- Per-ingredient analysis for each recipe
CREATE TABLE IF NOT EXISTS recipe_ingredient_analysis (
  id SERIAL PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES foodcom_recipes(recipe_id),
  ingredient_raw TEXT NOT NULL,           -- Original ingredient string
  canonical_slug TEXT,                     -- Matched canonical ingredient
  fdc_id INTEGER,                          -- Matched FDC food
  match_score NUMERIC(4,3),                -- Lexical scorer confidence
  match_status TEXT,                       -- mapped/needs_review/no_match
  cooking_methods TEXT[],                  -- Methods inferred from steps
  inferred_state TEXT,                     -- raw/cooked based on methods
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(recipe_id, ingredient_raw)
);

-- Indexes for analysis queries
CREATE INDEX IF NOT EXISTS idx_ria_recipe ON recipe_ingredient_analysis(recipe_id);
CREATE INDEX IF NOT EXISTS idx_ria_canonical ON recipe_ingredient_analysis(canonical_slug);
CREATE INDEX IF NOT EXISTS idx_ria_fdc ON recipe_ingredient_analysis(fdc_id);
CREATE INDEX IF NOT EXISTS idx_ria_status ON recipe_ingredient_analysis(match_status);
CREATE INDEX IF NOT EXISTS idx_ria_methods ON recipe_ingredient_analysis USING gin(cooking_methods);

-- Aggregate view: cooking method frequency per canonical ingredient
CREATE MATERIALIZED VIEW IF NOT EXISTS canonical_method_stats AS
WITH method_counts AS (
  SELECT 
    canonical_slug,
    unnest(cooking_methods) AS method,
    COUNT(*) AS usage_count
  FROM recipe_ingredient_analysis
  WHERE canonical_slug IS NOT NULL 
    AND cooking_methods IS NOT NULL 
    AND array_length(cooking_methods, 1) > 0
  GROUP BY canonical_slug, method
),
totals AS (
  SELECT 
    canonical_slug,
    SUM(usage_count) AS total_uses
  FROM method_counts
  GROUP BY canonical_slug
)
SELECT 
  mc.canonical_slug,
  mc.method,
  mc.usage_count,
  ROUND(100.0 * mc.usage_count / t.total_uses, 1) AS pct,
  t.total_uses
FROM method_counts mc
JOIN totals t USING (canonical_slug)
ORDER BY mc.canonical_slug, mc.usage_count DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cms_slug_method 
ON canonical_method_stats(canonical_slug, method);

COMMIT;
