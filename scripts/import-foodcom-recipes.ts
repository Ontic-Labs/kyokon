#!/usr/bin/env npx tsx
/**
 * Load Food.com recipe corpus into PostgreSQL
 * 
 * Usage:
 *   npx tsx scripts/import-foodcom-recipes.ts [--limit N] [--canary]
 * 
 * Flags:
 *   --canary  Only import recipes from canary tiers (91 elite + 1063 top-rated)
 *   --limit N Limit to N recipes (for testing)
 * 
 * Loads:
 *   - RAW_recipes.csv → foodcom_recipes
 *   - recipe-ratings.csv → foodcom_recipe_ratings
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createReadStream, readFileSync } from "fs";
import { createInterface } from "readline";
import { db } from "../src/lib/db";


const RECIPES_CSV = "data/RAW_recipes.csv";
const RATINGS_CSV = "data/recipe-ratings.csv";
const CANARY_ELITE_CSV = "data/canary-elite-91.csv";
const CANARY_TOP_RATED_CSV = "data/canary-top-rated-1063.csv";

interface RawRecipe {
  name: string;
  id: number;
  minutes: number;
  contributor_id: number;
  submitted: string;
  tags: string[];
  nutrition: number[];
  n_steps: number;
  steps: string[];
  description: string;
  ingredients: string[];
  n_ingredients: number;
}

/**
 * Parse a Python-style list string: "['a', 'b', 'c']" → ['a', 'b', 'c']
 */
function parsePythonList(s: string): string[] {
  if (!s || s === "[]") return [];
  try {
    // Replace single quotes with double quotes for JSON parsing
    const json = s.replace(/'/g, '"');
    return JSON.parse(json);
  } catch {
    // Fallback: manual parsing
    const inner = s.slice(1, -1); // Remove [ ]
    if (!inner.trim()) return [];
    return inner.split(/,\s*/).map(item => 
      item.replace(/^['"]|['"]$/g, "").trim()
    );
  }
}

function parseNutritionList(s: string): number[] {
  if (!s || s === "[]") return [];
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}

/**
 * Parse CSV line handling quoted fields with embedded commas
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;
  
  while (i < line.length) {
    const char = line[i];
    
    if (char === '"' && (i === 0 || line[i-1] !== '\\')) {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
    i++;
  }
  fields.push(current);
  
  // Clean up quotes
  return fields.map(f => {
    if (f.startsWith('"') && f.endsWith('"')) {
      return f.slice(1, -1).replace(/""/g, '"');
    }
    return f;
  });
}

async function loadRecipes(limit?: number, canaryIds?: Set<number>): Promise<Map<number, boolean>> {
  console.log("Loading recipes from", RECIPES_CSV);
  if (canaryIds) {
    console.log(`  Filtering to ${canaryIds.size} canary recipe IDs`);
  }
  
  const rl = createInterface({
    input: createReadStream(RECIPES_CSV),
    crlfDelay: Infinity,
  });

  let lineNum = 0;
  let loaded = 0;
  let skipped = 0;
  const loadedIds = new Map<number, boolean>();
  const batchSize = 500;
  let batch: RawRecipe[] = [];

  const flushBatch = async () => {
    if (batch.length === 0) return;
    
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIdx = 1;

    for (const r of batch) {
      placeholders.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
      values.push(
        r.id,
        r.name,
        r.minutes || null,
        r.contributor_id || null,
        r.submitted || null,
        JSON.stringify(r.tags),
        JSON.stringify(r.nutrition),
        r.n_steps || null,
        JSON.stringify(r.steps),
        r.description || null,
        JSON.stringify(r.ingredients),
        r.n_ingredients || null
      );
      loadedIds.set(r.id, true);
    }

    await db.query(`
      INSERT INTO foodcom_recipes (recipe_id, name, minutes, contributor_id, submitted, tags, nutrition, n_steps, steps, description, ingredients, n_ingredients)
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (recipe_id) DO NOTHING
    `, values);

    loaded += batch.length;
    batch = [];
  };

  for await (const line of rl) {
    lineNum++;
    if (lineNum === 1) continue; // Skip header

    if (limit && loaded >= limit) break;

    try {
      const fields = parseCSVLine(line);
      if (fields.length < 12) {
        skipped++;
        continue;
      }

      const recipe: RawRecipe = {
        name: fields[0],
        id: parseInt(fields[1], 10),
        minutes: parseInt(fields[2], 10),
        contributor_id: parseInt(fields[3], 10),
        submitted: fields[4],
        tags: parsePythonList(fields[5]),
        nutrition: parseNutritionList(fields[6]),
        n_steps: parseInt(fields[7], 10),
        steps: parsePythonList(fields[8]),
        description: fields[9],
        ingredients: parsePythonList(fields[10]),
        n_ingredients: parseInt(fields[11], 10),
      };

      if (isNaN(recipe.id)) {
        skipped++;
        continue;
      }

      // Skip if not in canary set (when filtering)
      if (canaryIds && !canaryIds.has(recipe.id)) {
        continue;
      }

      batch.push(recipe);

      if (batch.length >= batchSize) {
        await flushBatch();
        if (loaded % 10000 === 0) {
          console.log(`  ${loaded.toLocaleString()} recipes loaded...`);
        }
      }
    } catch (err) {
      console.error(`Error on line ${lineNum}:`, err);
      skipped++;
    }
  }

  await flushBatch();
  console.log(`Loaded ${loaded.toLocaleString()} recipes (${skipped} skipped)`);
  return loadedIds;
}

async function loadRatings(validIds: Map<number, boolean>): Promise<void> {
  console.log("Loading ratings from", RATINGS_CSV);
  
  const rl = createInterface({
    input: createReadStream(RATINGS_CSV),
    crlfDelay: Infinity,
  });

  let lineNum = 0;
  let loaded = 0;
  let skipped = 0;
  const batchSize = 1000;
  let batch: { recipe_id: number; avg_rating: number; review_count: number }[] = [];

  const flushBatch = async () => {
    if (batch.length === 0) return;
    
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIdx = 1;

    for (const r of batch) {
      placeholders.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
      values.push(r.recipe_id, r.avg_rating, r.review_count);
    }

    await db.query(`
      INSERT INTO foodcom_recipe_ratings (recipe_id, avg_rating, review_count)
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (recipe_id) DO NOTHING
    `, values);

    loaded += batch.length;
    batch = [];
  };

  for await (const line of rl) {
    lineNum++;
    if (lineNum === 1) continue; // Skip header

    try {
      const [recipeIdStr, avgRatingStr, reviewCountStr] = line.split(",");
      const recipeId = parseInt(recipeIdStr, 10);
      const avgRating = parseFloat(avgRatingStr);
      const reviewCount = parseInt(reviewCountStr, 10);

      if (isNaN(recipeId) || isNaN(avgRating) || isNaN(reviewCount)) {
        skipped++;
        continue;
      }

      // Only load ratings for recipes we have
      if (!validIds.has(recipeId)) {
        skipped++;
        continue;
      }

      batch.push({ recipe_id: recipeId, avg_rating: avgRating, review_count: reviewCount });

      if (batch.length >= batchSize) {
        await flushBatch();
        if (loaded % 50000 === 0) {
          console.log(`  ${loaded.toLocaleString()} ratings loaded...`);
        }
      }
    } catch (err) {
      console.error(`Error on line ${lineNum}:`, err);
      skipped++;
    }
  }

  await flushBatch();
  console.log(`Loaded ${loaded.toLocaleString()} ratings (${skipped} skipped)`);
}

async function refreshViews(): Promise<void> {
  console.log("Refreshing materialized views...");
  await db.query("REFRESH MATERIALIZED VIEW canary_elite_recipes");
  await db.query("REFRESH MATERIALIZED VIEW canary_top_rated_recipes");
  
  const elite = await db.query<{ count: string }>("SELECT COUNT(*) as count FROM canary_elite_recipes");
  const topRated = await db.query<{ count: string }>("SELECT COUNT(*) as count FROM canary_top_rated_recipes");
  
  console.log(`  canary_elite_recipes: ${elite.rows[0].count} recipes`);
  console.log(`  canary_top_rated_recipes: ${topRated.rows[0].count} recipes`);
}

function loadCanaryIds(): Set<number> {
  const ids = new Set<number>();
  
  // Load elite tier
  const elite = readFileSync(CANARY_ELITE_CSV, "utf-8");
  for (const line of elite.trim().split("\n")) {
    const id = parseInt(line.split(",")[0], 10);
    if (!isNaN(id)) ids.add(id);
  }
  
  // Load top-rated tier
  const topRated = readFileSync(CANARY_TOP_RATED_CSV, "utf-8");
  for (const line of topRated.trim().split("\n")) {
    const id = parseInt(line.split(",")[0], 10);
    if (!isNaN(id)) ids.add(id);
  }
  
  return ids;
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : undefined;
  const canaryMode = args.includes("--canary");

  if (limit) {
    console.log(`Limiting to ${limit} recipes`);
  }

  const canaryIds = canaryMode ? loadCanaryIds() : undefined;
  if (canaryIds) {
    console.log(`Canary mode: ${canaryIds.size} recipes from elite + top-rated tiers`);
  }

  const loadedIds = await loadRecipes(limit, canaryIds);
  await loadRatings(loadedIds);
  await refreshViews();

  console.log("Done!");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
