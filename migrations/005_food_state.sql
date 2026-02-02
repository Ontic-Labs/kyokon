-- Migration 005: Food state classification for recipe ingredient matching
-- Classifies foods along four independent axes extracted from descriptions:
--   1. cooking_state: unknown / raw / cooked
--   2. cooking_methods[]: multi-valued cooking methods
--   3. preservation: unknown / fresh / frozen / canned / etc.
--   4. processing: unknown / whole / ground / sliced / etc.
--
-- IMPORTANT: Defaults are 'unknown', NOT 'raw'/'fresh'/'whole'.
-- Only set a value when explicitly present in the description.
-- This prevents hallucinating state for items like "Butter, salted"
-- or "Acorn stew (Apache)" that lack explicit state keywords.

CREATE TABLE IF NOT EXISTS food_state (
  fdc_id BIGINT PRIMARY KEY REFERENCES foods(fdc_id) ON DELETE CASCADE,

  -- Axis 1: Is the food heat-treated?
  cooking_state TEXT NOT NULL DEFAULT 'unknown'
    CHECK (cooking_state IN ('unknown', 'raw', 'cooked')),

  -- Axis 2: Which cooking methods (multi-valued, may be empty)
  cooking_methods TEXT[] NOT NULL DEFAULT '{}',

  -- Axis 3: How is it preserved?
  preservation TEXT NOT NULL DEFAULT 'unknown'
    CHECK (preservation IN (
      'unknown', 'fresh', 'frozen', 'canned', 'dried', 'cured',
      'pickled', 'fermented', 'smoked'
    )),

  -- Axis 4: Physical processing form
  processing TEXT NOT NULL DEFAULT 'unknown'
    CHECK (processing IN (
      'unknown', 'whole', 'ground', 'sliced', 'diced', 'shredded',
      'pureed', 'paste', 'powder', 'flour', 'juice', 'oil',
      'broth', 'stock'
    )),

  -- Audit: which description tokens triggered the classification
  source_tokens TEXT[] NOT NULL DEFAULT '{}',

  -- Metadata
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assessment_version TEXT NOT NULL DEFAULT '1.0.0'
);

-- Indexes for filtering
CREATE INDEX IF NOT EXISTS idx_food_state_cooking_state
  ON food_state (cooking_state);

CREATE INDEX IF NOT EXISTS idx_food_state_preservation
  ON food_state (preservation);

CREATE INDEX IF NOT EXISTS idx_food_state_processing
  ON food_state (processing);

CREATE INDEX IF NOT EXISTS idx_food_state_cooking_methods_gin
  ON food_state USING GIN (cooking_methods);

-- Documentation
COMMENT ON TABLE food_state IS
'Classifies each food along cooking state, cooking methods, preservation, and processing axes for recipe ingredient matching. Defaults are unknown — only set when explicitly supported by description tokens.';

COMMENT ON COLUMN food_state.cooking_state IS
'unknown = no explicit keyword. raw = explicit (raw/uncooked). cooked = explicit cooking method or "cooked" keyword found.';

COMMENT ON COLUMN food_state.cooking_methods IS
'Array of cooking methods extracted from description (roasted, grilled, fried, etc.). Empty if not cooked or no specific method.';

COMMENT ON COLUMN food_state.preservation IS
'unknown = no preservation keyword. fresh/frozen/canned/dried/cured/pickled/fermented/smoked.';

COMMENT ON COLUMN food_state.processing IS
'unknown = no processing keyword. whole/ground/sliced/diced/shredded/pureed/paste/powder/flour/juice/oil/broth/stock.';

COMMENT ON COLUMN food_state.source_tokens IS
'Description tokens that triggered the classification. For audit and debugging.';
