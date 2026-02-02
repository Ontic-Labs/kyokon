-- FoodData Central SR Legacy Schema
-- Migration 001: Initial schema

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Food categories
CREATE TABLE IF NOT EXISTS food_categories (
  category_id BIGINT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Measure units for portions
CREATE TABLE IF NOT EXISTS measure_units (
  measure_unit_id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  abbreviation TEXT,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Nutrient definitions
CREATE TABLE IF NOT EXISTS nutrients (
  nutrient_id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  nutrient_rank INT,
  is_energy BOOLEAN DEFAULT FALSE,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Foods (main table)
CREATE TABLE IF NOT EXISTS foods (
  fdc_id BIGINT PRIMARY KEY,
  description TEXT NOT NULL,
  description_tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', description)) STORED,
  data_type TEXT NOT NULL DEFAULT 'sr_legacy',
  category_id BIGINT REFERENCES food_categories(category_id),
  published_date DATE,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Food nutrients (junction table)
CREATE TABLE IF NOT EXISTS food_nutrients (
  fdc_id BIGINT NOT NULL REFERENCES foods(fdc_id) ON DELETE CASCADE,
  nutrient_id BIGINT NOT NULL REFERENCES nutrients(nutrient_id),
  amount DOUBLE PRECISION NOT NULL,
  data_points INT,
  derivation_id BIGINT,
  min DOUBLE PRECISION,
  max DOUBLE PRECISION,
  median DOUBLE PRECISION,
  footnote TEXT,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (fdc_id, nutrient_id)
);

-- Food portions
CREATE TABLE IF NOT EXISTS food_portions (
  portion_id BIGSERIAL PRIMARY KEY,
  fdc_id BIGINT NOT NULL REFERENCES foods(fdc_id) ON DELETE CASCADE,
  measure_unit_id BIGINT REFERENCES measure_units(measure_unit_id),
  amount DOUBLE PRECISION,
  gram_weight DOUBLE PRECISION NOT NULL,
  modifier TEXT,
  sequence_number INT,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Indexes for full-text search
CREATE INDEX IF NOT EXISTS idx_foods_description_tsv ON foods USING GIN (description_tsv);

-- Optional: trigram index for fuzzy search
CREATE INDEX IF NOT EXISTS idx_foods_description_trgm ON foods USING GIN (description gin_trgm_ops);

-- Indexes for filtering
CREATE INDEX IF NOT EXISTS idx_foods_category_id ON foods (category_id);
CREATE INDEX IF NOT EXISTS idx_food_nutrients_nutrient_amount ON food_nutrients (nutrient_id, amount);
CREATE INDEX IF NOT EXISTS idx_food_nutrients_fdc_id ON food_nutrients (fdc_id);
CREATE INDEX IF NOT EXISTS idx_food_portions_fdc_id ON food_portions (fdc_id);
