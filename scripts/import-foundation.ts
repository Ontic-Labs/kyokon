/**
 * FoodData Central Foundation Foods Import Script
 *
 * Imports the USDA Foundation Foods JSON file into PostgreSQL.
 * Foundation Foods have additional Atwater conversion factors for energy calculation.
 *
 * Usage:
 *   npx tsx scripts/import-foundation.ts
 *
 * Requirements:
 *   - DATABASE_URL environment variable set
 *   - PostgreSQL database with migrations applied (including 004_atwater_factors.sql)
 *   - Foundation Foods JSON file at fdc/FoodData_Central_foundation_food_json_2025-12-18.json
 */

import * as fs from "fs";
import * as path from "path";
import { Pool, PoolClient } from "pg";
import * as dotenv from "dotenv";

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });

import type {
  FoundationFoodFile,
  SRLegacyFood,
  SRLegacyNutrient,
  SRLegacyMeasureUnit,
} from "../src/types/fdc";

// Configuration
const BATCH_SIZE_FOODS = 500;
const BATCH_SIZE_NUTRIENTS = 500;
const BATCH_SIZE_FOOD_NUTRIENTS = 3000;
const BATCH_SIZE_PORTIONS = 3000;
const BATCH_SIZE_FACTORS = 500;

const DATA_FILE_PATH = path.join(
  __dirname,
  "..",
  "fdc",
  "FoodData_Central_foundation_food_json_2025-12-18.json"
);

// Database connection
function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return new Pool({
    connectionString,
    max: 5,
  });
}

// Helper to parse dates (Foundation uses ISO format like "12/18/2025")
function parseDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  // Handle formats like "12/18/2025" or "2025-12-18"
  if (dateStr.includes("-")) {
    return dateStr; // Already ISO format
  }
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const [month, day, year] = parts;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return null;
}

// Atwater factor types
interface AtwaterFactors {
  fdcId: number;
  proteinFactor: number | null;
  fatFactor: number | null;
  carbohydrateFactor: number | null;
  rawJson: unknown;
}

interface ProteinFactor {
  fdcId: number;
  nitrogenFactor: number;
  rawJson: unknown;
}

// Collect unique entities from the data
interface CollectedData {
  categories: Map<string, number>; // name -> synthetic id
  nutrients: Map<number, SRLegacyNutrient>;
  measureUnits: Map<number, SRLegacyMeasureUnit>;
  atwaterFactors: AtwaterFactors[];
  proteinFactors: ProteinFactor[];
}

function collectEntities(foods: SRLegacyFood[]): CollectedData {
  const categories = new Map<string, number>();
  const nutrients = new Map<number, SRLegacyNutrient>();
  const measureUnits = new Map<number, SRLegacyMeasureUnit>();
  const atwaterFactors: AtwaterFactors[] = [];
  const proteinFactors: ProteinFactor[] = [];

  // Start category IDs at 100 to avoid conflicts with SR Legacy
  let categoryIdCounter = 100;

  for (const food of foods) {
    // Collect categories
    if (food.foodCategory?.description) {
      const catName = food.foodCategory.description;
      if (!categories.has(catName)) {
        categories.set(catName, categoryIdCounter++);
      }
    }

    // Collect nutrients
    for (const fn of food.foodNutrients || []) {
      if (fn.nutrient && !nutrients.has(fn.nutrient.id)) {
        nutrients.set(fn.nutrient.id, fn.nutrient);
      }
    }

    // Collect measure units
    for (const portion of food.foodPortions || []) {
      if (portion.measureUnit && !measureUnits.has(portion.measureUnit.id)) {
        measureUnits.set(portion.measureUnit.id, portion.measureUnit);
      }
    }

    // Collect conversion factors
    const ncf = (food.nutrientConversionFactors || []) as Array<{
      type: string;
      proteinValue?: number;
      fatValue?: number;
      carbohydrateValue?: number;
      value?: number;
    }>;

    for (const cf of ncf) {
      if (cf.type === ".CalorieConversionFactor") {
        atwaterFactors.push({
          fdcId: food.fdcId,
          proteinFactor: cf.proteinValue ?? null,
          fatFactor: cf.fatValue ?? null,
          carbohydrateFactor: cf.carbohydrateValue ?? null,
          rawJson: cf,
        });
      } else if (cf.type === ".ProteinConversionFactor" && cf.value) {
        proteinFactors.push({
          fdcId: food.fdcId,
          nitrogenFactor: cf.value,
          rawJson: cf,
        });
      }
    }
  }

  return { categories, nutrients, measureUnits, atwaterFactors, proteinFactors };
}

// Insert categories (upsert to handle existing from SR Legacy)
async function insertCategories(
  client: PoolClient,
  categories: Map<string, number>
): Promise<Map<string, number>> {
  if (categories.size === 0) return categories;

  console.log(`Upserting ${categories.size} categories...`);

  // First, check for existing categories by name and get their IDs
  const existingResult = await client.query<{ category_id: number; name: string }>(
    `SELECT category_id, name FROM food_categories WHERE name = ANY($1)`,
    [Array.from(categories.keys())]
  );

  const finalCategories = new Map<string, number>();

  // Map existing categories
  for (const row of existingResult.rows) {
    finalCategories.set(row.name, row.category_id);
  }

  // Insert only new categories
  const newCategories: Array<[string, number]> = [];
  for (const [name, id] of categories) {
    if (!finalCategories.has(name)) {
      newCategories.push([name, id]);
      finalCategories.set(name, id);
    }
  }

  if (newCategories.length > 0) {
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;

    for (const [name, id] of newCategories) {
      placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2})`);
      values.push(id, name, JSON.stringify({ name }));
      idx += 3;
    }

    await client.query(
      `INSERT INTO food_categories (category_id, name, raw_json)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (category_id) DO UPDATE SET
         name = EXCLUDED.name,
         raw_json = EXCLUDED.raw_json`,
      values
    );
    console.log(`  Inserted ${newCategories.length} new categories`);
  }

  return finalCategories;
}

// Insert nutrients (upsert)
async function insertNutrients(
  client: PoolClient,
  nutrients: Map<number, SRLegacyNutrient>
): Promise<void> {
  if (nutrients.size === 0) return;

  console.log(`Upserting ${nutrients.size} nutrients...`);

  const entries = Array.from(nutrients.values());

  for (let i = 0; i < entries.length; i += BATCH_SIZE_NUTRIENTS) {
    const batch = entries.slice(i, i + BATCH_SIZE_NUTRIENTS);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;

    for (const nutrient of batch) {
      const isEnergy =
        nutrient.unitName.toLowerCase() === "kcal" ||
        nutrient.unitName.toLowerCase() === "kj";
      placeholders.push(
        `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5})`
      );
      values.push(
        nutrient.id,
        nutrient.name,
        nutrient.unitName,
        nutrient.rank || null,
        isEnergy,
        JSON.stringify(nutrient)
      );
      idx += 6;
    }

    await client.query(
      `INSERT INTO nutrients (nutrient_id, name, unit_name, nutrient_rank, is_energy, raw_json)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (nutrient_id) DO UPDATE SET
         name = EXCLUDED.name,
         unit_name = EXCLUDED.unit_name,
         nutrient_rank = EXCLUDED.nutrient_rank,
         is_energy = EXCLUDED.is_energy,
         raw_json = EXCLUDED.raw_json`,
      values
    );
  }
}

// Insert measure units (upsert)
async function insertMeasureUnits(
  client: PoolClient,
  measureUnits: Map<number, SRLegacyMeasureUnit>
): Promise<void> {
  if (measureUnits.size === 0) return;

  console.log(`Upserting ${measureUnits.size} measure units...`);

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let idx = 1;

  for (const unit of measureUnits.values()) {
    placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3})`);
    values.push(
      unit.id,
      unit.name,
      unit.abbreviation || null,
      JSON.stringify(unit)
    );
    idx += 4;
  }

  await client.query(
    `INSERT INTO measure_units (measure_unit_id, name, abbreviation, raw_json)
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (measure_unit_id) DO UPDATE SET
       name = EXCLUDED.name,
       abbreviation = EXCLUDED.abbreviation,
       raw_json = EXCLUDED.raw_json`,
    values
  );
}

// Insert foods
async function insertFoods(
  client: PoolClient,
  foods: SRLegacyFood[],
  categories: Map<string, number>
): Promise<void> {
  console.log(`Inserting ${foods.length} Foundation foods...`);

  for (let i = 0; i < foods.length; i += BATCH_SIZE_FOODS) {
    const batch = foods.slice(i, i + BATCH_SIZE_FOODS);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;

    for (const food of batch) {
      const categoryId = food.foodCategory?.description
        ? categories.get(food.foodCategory.description) || null
        : null;

      placeholders.push(
        `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5})`
      );
      values.push(
        food.fdcId,
        food.description,
        "foundation", // data_type
        categoryId,
        parseDate(food.publicationDate),
        JSON.stringify(food)
      );
      idx += 6;
    }

    await client.query(
      `INSERT INTO foods (fdc_id, description, data_type, category_id, published_date, raw_json)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (fdc_id) DO UPDATE SET
         description = EXCLUDED.description,
         data_type = EXCLUDED.data_type,
         category_id = EXCLUDED.category_id,
         published_date = EXCLUDED.published_date,
         raw_json = EXCLUDED.raw_json`,
      values
    );
  }
}

// Insert food nutrients
async function insertFoodNutrients(
  client: PoolClient,
  foods: SRLegacyFood[]
): Promise<void> {
  console.log(`Inserting food nutrients...`);

  // Collect all food nutrients
  const allFoodNutrients: Array<{
    fdcId: number;
    nutrientId: number;
    amount: number;
    dataPoints: number | null;
    min: number | null;
    max: number | null;
    median: number | null;
    footnote: string | null;
    rawJson: unknown;
  }> = [];

  for (const food of foods) {
    for (const fn of food.foodNutrients || []) {
      if (fn.nutrient && fn.amount !== undefined) {
        allFoodNutrients.push({
          fdcId: food.fdcId,
          nutrientId: fn.nutrient.id,
          amount: fn.amount,
          dataPoints: fn.dataPoints ?? null,
          min: fn.min ?? null,
          max: fn.max ?? null,
          median: fn.median ?? null,
          footnote: fn.footnote ?? null,
          rawJson: fn,
        });
      }
    }
  }

  console.log(`  Total food nutrients: ${allFoodNutrients.length}`);

  for (let i = 0; i < allFoodNutrients.length; i += BATCH_SIZE_FOOD_NUTRIENTS) {
    const batch = allFoodNutrients.slice(i, i + BATCH_SIZE_FOOD_NUTRIENTS);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;

    for (const fn of batch) {
      placeholders.push(
        `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7}, $${idx + 8})`
      );
      values.push(
        fn.fdcId,
        fn.nutrientId,
        fn.amount,
        fn.dataPoints,
        fn.min,
        fn.max,
        fn.median,
        fn.footnote,
        JSON.stringify(fn.rawJson)
      );
      idx += 9;
    }

    await client.query(
      `INSERT INTO food_nutrients (fdc_id, nutrient_id, amount, data_points, min, max, median, footnote, raw_json)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (fdc_id, nutrient_id) DO UPDATE SET
         amount = EXCLUDED.amount,
         data_points = EXCLUDED.data_points,
         min = EXCLUDED.min,
         max = EXCLUDED.max,
         median = EXCLUDED.median,
         footnote = EXCLUDED.footnote,
         raw_json = EXCLUDED.raw_json`,
      values
    );

    if ((i + BATCH_SIZE_FOOD_NUTRIENTS) % 20000 === 0) {
      console.log(
        `  Inserted ${Math.min(i + BATCH_SIZE_FOOD_NUTRIENTS, allFoodNutrients.length)} food nutrients...`
      );
    }
  }
}

// Insert food portions
async function insertFoodPortions(
  client: PoolClient,
  foods: SRLegacyFood[]
): Promise<void> {
  console.log(`Inserting food portions...`);

  // Collect all portions
  const allPortions: Array<{
    fdcId: number;
    measureUnitId: number | null;
    amount: number | null;
    gramWeight: number;
    modifier: string | null;
    sequenceNumber: number | null;
    rawJson: unknown;
  }> = [];

  for (const food of foods) {
    for (const portion of food.foodPortions || []) {
      allPortions.push({
        fdcId: food.fdcId,
        measureUnitId: portion.measureUnit?.id ?? null,
        amount: portion.amount ?? portion.value ?? null,
        gramWeight: portion.gramWeight,
        modifier: portion.modifier ?? null,
        sequenceNumber: portion.sequenceNumber ?? null,
        rawJson: portion,
      });
    }
  }

  console.log(`  Total food portions: ${allPortions.length}`);

  // Clear existing portions for these foods (portions don't have stable IDs)
  const fdcIds = [...new Set(foods.map((f) => f.fdcId))];
  await client.query(
    `DELETE FROM food_portions WHERE fdc_id = ANY($1)`,
    [fdcIds]
  );

  // Insert new portions
  for (let i = 0; i < allPortions.length; i += BATCH_SIZE_PORTIONS) {
    const batch = allPortions.slice(i, i + BATCH_SIZE_PORTIONS);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;

    for (const portion of batch) {
      placeholders.push(
        `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6})`
      );
      values.push(
        portion.fdcId,
        portion.measureUnitId,
        portion.amount,
        portion.gramWeight,
        portion.modifier,
        portion.sequenceNumber,
        JSON.stringify(portion.rawJson)
      );
      idx += 7;
    }

    await client.query(
      `INSERT INTO food_portions (fdc_id, measure_unit_id, amount, gram_weight, modifier, sequence_number, raw_json)
       VALUES ${placeholders.join(", ")}`,
      values
    );
  }
}

// Insert Atwater conversion factors
async function insertAtwaterFactors(
  client: PoolClient,
  factors: AtwaterFactors[]
): Promise<void> {
  if (factors.length === 0) return;

  console.log(`Inserting ${factors.length} Atwater calorie conversion factors...`);

  for (let i = 0; i < factors.length; i += BATCH_SIZE_FACTORS) {
    const batch = factors.slice(i, i + BATCH_SIZE_FACTORS);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;

    for (const f of batch) {
      placeholders.push(
        `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`
      );
      values.push(
        f.fdcId,
        f.proteinFactor,
        f.fatFactor,
        f.carbohydrateFactor,
        JSON.stringify(f.rawJson)
      );
      idx += 5;
    }

    await client.query(
      `INSERT INTO food_atwater_factors (fdc_id, protein_factor, fat_factor, carbohydrate_factor, raw_json)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (fdc_id) DO UPDATE SET
         protein_factor = EXCLUDED.protein_factor,
         fat_factor = EXCLUDED.fat_factor,
         carbohydrate_factor = EXCLUDED.carbohydrate_factor,
         raw_json = EXCLUDED.raw_json`,
      values
    );
  }
}

// Insert protein conversion factors
async function insertProteinFactors(
  client: PoolClient,
  factors: ProteinFactor[]
): Promise<void> {
  if (factors.length === 0) return;

  console.log(`Inserting ${factors.length} protein (nitrogen) conversion factors...`);

  for (let i = 0; i < factors.length; i += BATCH_SIZE_FACTORS) {
    const batch = factors.slice(i, i + BATCH_SIZE_FACTORS);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;

    for (const f of batch) {
      placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2})`);
      values.push(f.fdcId, f.nitrogenFactor, JSON.stringify(f.rawJson));
      idx += 3;
    }

    await client.query(
      `INSERT INTO food_protein_factors (fdc_id, nitrogen_factor, raw_json)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (fdc_id) DO UPDATE SET
         nitrogen_factor = EXCLUDED.nitrogen_factor,
         raw_json = EXCLUDED.raw_json`,
      values
    );
  }
}

// Main import function
async function main(): Promise<void> {
  console.log("=== FoodData Central Foundation Foods Import ===\n");

  // Check if data file exists
  if (!fs.existsSync(DATA_FILE_PATH)) {
    console.error(`Data file not found: ${DATA_FILE_PATH}`);
    process.exit(1);
  }

  console.log(`Reading data file: ${DATA_FILE_PATH}`);
  const startRead = Date.now();
  const rawData = fs.readFileSync(DATA_FILE_PATH, "utf-8");
  const data: FoundationFoodFile = JSON.parse(rawData);
  console.log(`  Read and parsed in ${((Date.now() - startRead) / 1000).toFixed(1)}s`);

  const foods = data.FoundationFoods;
  console.log(`  Found ${foods.length} foods\n`);

  // Collect unique entities
  console.log("Collecting unique entities...");
  const { categories, nutrients, measureUnits, atwaterFactors, proteinFactors } =
    collectEntities(foods);
  console.log(`  Categories: ${categories.size}`);
  console.log(`  Nutrients: ${nutrients.size}`);
  console.log(`  Measure units: ${measureUnits.size}`);
  console.log(`  Atwater factors: ${atwaterFactors.length}`);
  console.log(`  Protein factors: ${proteinFactors.length}\n`);

  // Connect to database
  const pool = getPool();
  const client = await pool.connect();

  try {
    console.log("Starting database import...\n");
    const startImport = Date.now();

    await client.query("BEGIN");

    // Insert dimension tables first
    const finalCategories = await insertCategories(client, categories);
    await insertNutrients(client, nutrients);
    await insertMeasureUnits(client, measureUnits);

    // Insert foods
    await insertFoods(client, foods, finalCategories);

    // Insert food nutrients
    await insertFoodNutrients(client, foods);

    // Insert food portions
    await insertFoodPortions(client, foods);

    // Insert conversion factors (Foundation-specific)
    await insertAtwaterFactors(client, atwaterFactors);
    await insertProteinFactors(client, proteinFactors);

    await client.query("COMMIT");

    const elapsed = ((Date.now() - startImport) / 1000).toFixed(1);
    console.log(`\n=== Import completed in ${elapsed}s ===`);

    // Print summary
    const counts = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM foods WHERE data_type = 'foundation') as foundation_foods,
        (SELECT COUNT(*) FROM food_atwater_factors) as atwater_factors,
        (SELECT COUNT(*) FROM food_protein_factors) as protein_factors
    `);
    console.log(`\nSummary:`);
    console.log(`  Foundation foods: ${counts.rows[0].foundation_foods}`);
    console.log(`  Atwater factors: ${counts.rows[0].atwater_factors}`);
    console.log(`  Protein factors: ${counts.rows[0].protein_factors}`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Import failed:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
