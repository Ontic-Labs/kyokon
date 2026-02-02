-- Migration 004: Add Atwater conversion factors for Foundation Foods
-- These factors are used to compute energy (kcal) from macronutrients

-- Atwater calorie conversion factors per food
CREATE TABLE IF NOT EXISTS food_atwater_factors (
  fdc_id BIGINT PRIMARY KEY REFERENCES foods(fdc_id) ON DELETE CASCADE,
  protein_factor DOUBLE PRECISION
    CHECK (protein_factor BETWEEN 0 AND 20),
  fat_factor DOUBLE PRECISION
    CHECK (fat_factor BETWEEN 0 AND 20),
  carbohydrate_factor DOUBLE PRECISION
    CHECK (carbohydrate_factor BETWEEN 0 AND 20),
  raw_json JSONB,
  -- Atwater factors always come as a complete triple in FDC data
  CONSTRAINT ck_atwater_all_or_none CHECK (
    (protein_factor IS NULL AND fat_factor IS NULL AND carbohydrate_factor IS NULL)
    OR
    (protein_factor IS NOT NULL AND fat_factor IS NOT NULL AND carbohydrate_factor IS NOT NULL)
  )
);

-- Protein conversion factors (nitrogen to protein multiplier)
-- These vary by food type (e.g., 6.25 general, 5.18 for nuts, 6.38 for milk)
CREATE TABLE IF NOT EXISTS food_protein_factors (
  fdc_id BIGINT PRIMARY KEY REFERENCES foods(fdc_id) ON DELETE CASCADE,
  nitrogen_factor DOUBLE PRECISION NOT NULL
    CHECK (nitrogen_factor BETWEEN 0 AND 20),
  raw_json JSONB
);

COMMENT ON TABLE food_atwater_factors IS
'Atwater calorie conversion factors per food. Used to compute energy (kcal) from macronutrients.';

COMMENT ON COLUMN food_atwater_factors.protein_factor IS
'kcal per gram of protein. Standard general value is 4.0; specific values range ~2.44–4.36.';

COMMENT ON COLUMN food_atwater_factors.fat_factor IS
'kcal per gram of fat. Standard general value is 9.0; specific values range ~8.37–9.02.';

COMMENT ON COLUMN food_atwater_factors.carbohydrate_factor IS
'kcal per gram of carbohydrate. Standard general value is 4.0; specific values range ~2.70–4.16.';

COMMENT ON TABLE food_protein_factors IS
'Nitrogen-to-protein conversion factors per food. Multiplied by nitrogen content to estimate protein.';

COMMENT ON COLUMN food_protein_factors.nitrogen_factor IS
'Nitrogen-to-protein multiplier. Standard general value is 6.25; ranges ~3.24–6.38 by food type.';
