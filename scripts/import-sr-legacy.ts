/**
 * FoodData Central SR Legacy Import Script
 *
 * Imports the USDA SR Legacy JSON file into PostgreSQL.
 *
 * Usage:
 *   npx tsx scripts/import-sr-legacy.ts
 *
 * Requirements:
 *   - DATABASE_URL environment variable set
 *   - PostgreSQL database with migrations applied
 *   - SR Legacy JSON file at fdc/FoodData_Central_sr_legacy_food_json_2018-04.json
 */

import * as fs from "fs";
import * as path from "path";
import { Pool, PoolClient } from "pg";
import * as dotenv from "dotenv";

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });

import type {
  SRLegacyFile,
  SRLegacyFood,
  SRLegacyNutrient,
  SRLegacyMeasureUnit,
} from "../src/types/fdc";

// Configuration
// PostgreSQL has a max of ~32,767 parameters per query
// food_nutrients has 9 params per row, so max ~3600 rows per batch
const BATCH_SIZE_FOODS = 500;
const BATCH_SIZE_NUTRIENTS = 500;
const BATCH_SIZE_FOOD_NUTRIENTS = 3000;
const BATCH_SIZE_PORTIONS = 3000;

const DATA_FILE_PATH = path.join(
  __dirname,
  "..",
  "fdc",
  "FoodData_Central_sr_legacy_food_json_2018-04.json"
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

// Helper to parse dates
function parseDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  // Handle formats like "4/1/2019"
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const [month, day, year] = parts;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return null;
}

// Collect unique entities from the data
interface CollectedData {
  categories: Map<string, number>; // name -> synthetic id
  nutrients: Map<number, SRLegacyNutrient>;
  measureUnits: Map<number, SRLegacyMeasureUnit>;
}

function collectEntities(foods: SRLegacyFood[]): CollectedData {
  const categories = new Map<string, number>();
  const nutrients = new Map<number, SRLegacyNutrient>();
  const measureUnits = new Map<number, SRLegacyMeasureUnit>();

  let categoryIdCounter = 1;

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
  }

  return { categories, nutrients, measureUnits };
}

// Insert categories
async function insertCategories(
  client: PoolClient,
  categories: Map<string, number>
): Promise<void> {
  if (categories.size === 0) return;

  console.log(`Inserting ${categories.size} categories...`);

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let idx = 1;

  for (const [name, id] of categories) {
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
}

// Insert nutrients
async function insertNutrients(
  client: PoolClient,
  nutrients: Map<number, SRLegacyNutrient>
): Promise<void> {
  if (nutrients.size === 0) return;

  console.log(`Inserting ${nutrients.size} nutrients...`);

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

// Insert measure units
async function insertMeasureUnits(
  client: PoolClient,
  measureUnits: Map<number, SRLegacyMeasureUnit>
): Promise<void> {
  if (measureUnits.size === 0) return;

  console.log(`Inserting ${measureUnits.size} measure units...`);

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
  console.log(`Inserting ${foods.length} foods...`);

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
        food.dataType?.toLowerCase().replace(/\s+/g, "_") || "sr_legacy",
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

    if ((i + BATCH_SIZE_FOODS) % 2000 === 0) {
      console.log(`  Inserted ${Math.min(i + BATCH_SIZE_FOODS, foods.length)} foods...`);
    }
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

    if ((i + BATCH_SIZE_FOOD_NUTRIENTS) % 50000 === 0) {
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
  for (let i = 0; i < fdcIds.length; i += 1000) {
    const batch = fdcIds.slice(i, i + 1000);
    await client.query(
      `DELETE FROM food_portions WHERE fdc_id = ANY($1)`,
      [batch]
    );
  }

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

// Main import function
async function main(): Promise<void> {
  console.log("=== FoodData Central SR Legacy Import ===\n");

  // Check if data file exists
  if (!fs.existsSync(DATA_FILE_PATH)) {
    console.error(`Data file not found: ${DATA_FILE_PATH}`);
    process.exit(1);
  }

  console.log(`Reading data file: ${DATA_FILE_PATH}`);
  const startRead = Date.now();
  const rawData = fs.readFileSync(DATA_FILE_PATH, "utf-8");
  const data: SRLegacyFile = JSON.parse(rawData);
  console.log(`  Read and parsed in ${((Date.now() - startRead) / 1000).toFixed(1)}s`);

  const foods = data.SRLegacyFoods;
  console.log(`  Found ${foods.length} foods\n`);

  // Collect unique entities
  console.log("Collecting unique entities...");
  const { categories, nutrients, measureUnits } = collectEntities(foods);
  console.log(`  Categories: ${categories.size}`);
  console.log(`  Nutrients: ${nutrients.size}`);
  console.log(`  Measure units: ${measureUnits.size}\n`);

  // Connect to database
  const pool = getPool();
  const client = await pool.connect();

  try {
    console.log("Starting database import...\n");
    const startImport = Date.now();

    await client.query("BEGIN");

    // Insert dimension tables first
    await insertCategories(client, categories);
    await insertNutrients(client, nutrients);
    await insertMeasureUnits(client, measureUnits);

    // Insert foods
    await insertFoods(client, foods, categories);

    // Insert food nutrients
    await insertFoodNutrients(client, foods);

    // Insert food portions
    await insertFoodPortions(client, foods);

    await client.query("COMMIT");

    const elapsed = ((Date.now() - startImport) / 1000).toFixed(1);
    console.log(`\n=== Import completed in ${elapsed}s ===`);
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
