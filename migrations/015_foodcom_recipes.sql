-- Migration 015: Food.com recipe corpus for canary testing
-- Source: Kaggle Food.com Recipes and Interactions dataset
-- https://www.kaggle.com/datasets/shuyangli94/food-com-recipes-and-user-interactions

BEGIN;

-- Recipe metadata from RAW_recipes.csv
CREATE TABLE IF NOT EXISTS foodcom_recipes (
  recipe_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  minutes INTEGER,
  contributor_id INTEGER,
  submitted DATE,
  tags JSONB,                    -- ['tag1', 'tag2', ...]
  nutrition JSONB,               -- [calories, fat, sugar, sodium, protein, sat_fat, carbs]
  n_steps INTEGER,
  steps JSONB,                   -- ['step1', 'step2', ...]
  description TEXT,
  ingredients JSONB,             -- ['ingredient1', 'ingredient2', ...]
  n_ingredients INTEGER
);

-- Aggregated ratings from RAW_interactions.csv
CREATE TABLE IF NOT EXISTS foodcom_recipe_ratings (
  recipe_id INTEGER PRIMARY KEY REFERENCES foodcom_recipes(recipe_id),
  avg_rating NUMERIC(4,3) NOT NULL,
  review_count INTEGER NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_foodcom_ratings_count ON foodcom_recipe_ratings(review_count DESC);
CREATE INDEX IF NOT EXISTS idx_foodcom_ratings_avg ON foodcom_recipe_ratings(avg_rating DESC);
CREATE INDEX IF NOT EXISTS idx_foodcom_recipes_name ON foodcom_recipes USING gin(to_tsvector('english', name));

-- Canary tiers (materialized views for fast access)
CREATE MATERIALIZED VIEW IF NOT EXISTS canary_elite_recipes AS
SELECT r.*, rt.avg_rating, rt.review_count
FROM foodcom_recipes r
JOIN foodcom_recipe_ratings rt USING (recipe_id)
WHERE rt.review_count >= 100 AND rt.avg_rating >= 4.7
ORDER BY rt.review_count DESC;

CREATE MATERIALIZED VIEW IF NOT EXISTS canary_top_rated_recipes AS
SELECT r.*, rt.avg_rating, rt.review_count
FROM foodcom_recipes r
JOIN foodcom_recipe_ratings rt USING (recipe_id)
WHERE rt.review_count >= 50 AND rt.avg_rating >= 4.5
ORDER BY rt.review_count DESC;

COMMIT;
