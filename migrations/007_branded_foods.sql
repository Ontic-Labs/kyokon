-- Migration 007: Branded foods columns
-- Adds brand-specific fields to support FDC Branded Foods dataset

-- Add branded-specific columns
ALTER TABLE foods ADD COLUMN IF NOT EXISTS brand_owner TEXT;
ALTER TABLE foods ADD COLUMN IF NOT EXISTS gtin_upc TEXT;
ALTER TABLE foods ADD COLUMN IF NOT EXISTS branded_category TEXT;
ALTER TABLE foods ADD COLUMN IF NOT EXISTS serving_size NUMERIC;
ALTER TABLE foods ADD COLUMN IF NOT EXISTS serving_size_unit TEXT;
ALTER TABLE foods ADD COLUMN IF NOT EXISTS ingredients TEXT;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_foods_brand_owner ON foods(brand_owner);
CREATE INDEX IF NOT EXISTS idx_foods_gtin_upc ON foods(gtin_upc);
CREATE INDEX IF NOT EXISTS idx_foods_branded_category ON foods(branded_category);

-- Partial index for branded foods only
CREATE INDEX IF NOT EXISTS idx_foods_branded ON foods(data_type) WHERE data_type = 'Branded';

COMMENT ON COLUMN foods.brand_owner IS 'Brand owner/manufacturer name from FDC Branded Foods';
COMMENT ON COLUMN foods.gtin_upc IS 'GTIN/UPC barcode from FDC Branded Foods';
COMMENT ON COLUMN foods.branded_category IS 'Product category from FDC Branded Foods';
COMMENT ON COLUMN foods.serving_size IS 'Serving size amount from FDC Branded Foods';
COMMENT ON COLUMN foods.serving_size_unit IS 'Serving size unit (g, ml, etc) from FDC Branded Foods';
COMMENT ON COLUMN foods.ingredients IS 'Ingredient list text from FDC Branded Foods';
