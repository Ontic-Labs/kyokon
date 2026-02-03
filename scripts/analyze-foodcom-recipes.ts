#!/usr/bin/env npx tsx
/**
 * Analyze Food.com recipes: map ingredients + extract cooking methods from steps
 * 
 * Usage:
 *   npx tsx scripts/analyze-foodcom-recipes.ts [--tier elite|top|all] [--limit N] [--dry-run]
 * 
 * This script:
 *   1. Loads recipes from foodcom_recipes (or canary views)
 *   2. Maps each ingredient to canonical using lexical scorer
 *   3. Extracts cooking methods from recipe steps
 *   4. Persists to recipe_ingredient_analysis table
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../src/lib/db";
import {
  buildIdfWeights,
  processFdcFood,
  processIngredient,
  scoreCandidate,
  classifyScore,
  splitCompounds,
  THRESHOLD_MAPPED,
  ProcessedFdcFood,
  IdfWeights,
} from "../src/lib/lexical-scorer";

// ---------------------------------------------------------------------------
// Cooking method extraction
// ---------------------------------------------------------------------------

/**
 * Cooking method verbs → normalized past tense form.
 * Maps both present tense ("bake") and past tense ("baked") to the canonical form.
 */
const COOKING_METHOD_MAP = new Map<string, string>([
  // Present → past
  ["bake", "baked"], ["bakes", "baked"], ["baking", "baked"],
  ["blanch", "blanched"], ["blanches", "blanched"], ["blanching", "blanched"],
  ["boil", "boiled"], ["boils", "boiled"], ["boiling", "boiled"],
  ["braise", "braised"], ["braises", "braised"], ["braising", "braised"],
  ["broil", "broiled"], ["broils", "broiled"], ["broiling", "broiled"],
  ["fry", "fried"], ["fries", "fried"], ["frying", "fried"],
  ["deep-fry", "fried"], ["deep fry", "fried"],
  ["pan-fry", "fried"], ["pan fry", "fried"],
  ["stir-fry", "fried"], ["stir fry", "fried"],
  ["grill", "grilled"], ["grills", "grilled"], ["grilling", "grilled"],
  ["microwave", "microwaved"], ["microwaves", "microwaved"], ["microwaving", "microwaved"],
  ["poach", "poached"], ["poaches", "poached"], ["poaching", "poached"],
  ["roast", "roasted"], ["roasts", "roasted"], ["roasting", "roasted"],
  ["saute", "sauteed"], ["sautee", "sauteed"], ["sauteed", "sauteed"],
  ["sauté", "sauteed"], ["sautés", "sauteed"], ["sautéing", "sauteed"],
  ["scramble", "scrambled"], ["scrambles", "scrambled"], ["scrambling", "scrambled"],
  ["simmer", "simmered"], ["simmers", "simmered"], ["simmering", "simmered"],
  ["smoke", "smoked"], ["smokes", "smoked"], ["smoking", "smoked"],
  ["steam", "steamed"], ["steams", "steamed"], ["steaming", "steamed"],
  ["stew", "stewed"], ["stews", "stewed"], ["stewing", "stewed"],
  ["toast", "toasted"], ["toasts", "toasted"], ["toasting", "toasted"],
  // Past tense already
  ["baked", "baked"], ["blanched", "blanched"], ["boiled", "boiled"],
  ["braised", "braised"], ["broiled", "broiled"], ["fried", "fried"],
  ["grilled", "grilled"], ["microwaved", "microwaved"], ["poached", "poached"],
  ["roasted", "roasted"], ["sautéed", "sauteed"], ["scrambled", "scrambled"],
  ["simmered", "simmered"], ["smoked", "smoked"], ["steamed", "steamed"],
  ["stewed", "stewed"], ["toasted", "toasted"],
]);

/**
 * Extract cooking methods from recipe steps.
 * Returns unique methods found, in order of first appearance.
 */
function extractCookingMethods(steps: string[]): string[] {
  const found = new Set<string>();
  const result: string[] = [];
  
  for (const step of steps) {
    const words = step.toLowerCase().replace(/[^a-z\s-]/g, " ").split(/\s+/);
    for (const word of words) {
      const method = COOKING_METHOD_MAP.get(word);
      if (method && !found.has(method)) {
        found.add(method);
        result.push(method);
      }
    }
  }
  
  return result;
}

/**
 * Infer cooked/raw state from cooking methods.
 */
function inferState(methods: string[]): "raw" | "cooked" | "unknown" {
  if (methods.length === 0) return "unknown";
  // Any cooking method implies cooked
  return "cooked";
}

// ---------------------------------------------------------------------------
// FDC data loading
// ---------------------------------------------------------------------------

interface FdcRow {
  fdc_id: number;
  description: string;
  data_type: "sr_legacy" | "foundation";
  category_name: string | null;
}

async function loadFdcFoods(): Promise<ProcessedFdcFood[]> {
  console.log("Loading FDC foods...");
  const result = await db.query<FdcRow>(`
    SELECT f.fdc_id, f.description, f.data_type, c.name AS category_name
    FROM foods f
    LEFT JOIN food_categories c ON f.category_id = c.category_id
    WHERE f.data_type IN ('sr_legacy', 'foundation')
  `);
  
  const foods = result.rows.map(row => 
    processFdcFood(row.fdc_id, row.description, row.data_type, row.category_name)
  );
  
  console.log(`  Loaded ${foods.length} FDC foods`);
  return foods;
}

// ---------------------------------------------------------------------------
// Recipe processing
// ---------------------------------------------------------------------------

interface RecipeRow {
  recipe_id: number;
  name: string;
  ingredients: string[];  // JSONB parsed
  steps: string[];        // JSONB parsed
}

async function loadRecipes(tier: "elite" | "top" | "all", limit?: number): Promise<RecipeRow[]> {
  let query: string;
  
  switch (tier) {
    case "elite":
      query = `SELECT recipe_id, name, ingredients, steps FROM canary_elite_recipes`;
      break;
    case "top":
      query = `SELECT recipe_id, name, ingredients, steps FROM canary_top_rated_recipes`;
      break;
    case "all":
      query = `SELECT recipe_id, name, ingredients, steps FROM foodcom_recipes`;
      break;
  }
  
  if (limit) {
    query += ` LIMIT ${limit}`;
  }
  
  console.log(`Loading recipes (tier=${tier}, limit=${limit || "none"})...`);
  const result = await db.query<RecipeRow>(query);
  console.log(`  Loaded ${result.rows.length} recipes`);
  return result.rows;
}

interface IngredientAnalysis {
  recipe_id: number;
  ingredient_raw: string;
  canonical_slug: string | null;
  fdc_id: number | null;
  match_score: number | null;
  match_status: string;
  cooking_methods: string[];
  inferred_state: string;
}

function analyzeRecipe(
  recipe: RecipeRow,
  fdcFoods: ProcessedFdcFood[],
  idf: IdfWeights,
): IngredientAnalysis[] {
  const methods = extractCookingMethods(recipe.steps || []);
  const inferredState = inferState(methods);
  const results: IngredientAnalysis[] = [];
  
  for (const rawIngredient of recipe.ingredients || []) {
    // Split compounds (e.g., "salt and pepper" → ["salt", "pepper"])
    const parts = splitCompounds(rawIngredient);
    
    for (const part of parts) {
      const processed = processIngredient(part, idf);
      
      // Skip if no core tokens
      if (processed.coreTokens.length === 0) {
        results.push({
          recipe_id: recipe.recipe_id,
          ingredient_raw: part,
          canonical_slug: null,
          fdc_id: null,
          match_score: null,
          match_status: "no_match",
          cooking_methods: methods,
          inferred_state: inferredState,
        });
        continue;
      }
      
      // Score against all FDC foods
      let bestMatch: { fdcId: number; score: number; slug: string } | null = null;
      
      for (const food of fdcFoods) {
        const result = scoreCandidate(processed, food, idf);
        if (!bestMatch || result.score > bestMatch.score) {
          bestMatch = {
            fdcId: food.fdcId,
            score: result.score,
            slug: food.slug,
          };
        }
      }
      
      const status = bestMatch ? classifyScore(bestMatch.score) : "no_match";
      
      results.push({
        recipe_id: recipe.recipe_id,
        ingredient_raw: part,
        canonical_slug: bestMatch && bestMatch.score >= THRESHOLD_MAPPED ? bestMatch.slug : null,
        fdc_id: bestMatch && bestMatch.score >= THRESHOLD_MAPPED ? bestMatch.fdcId : null,
        match_score: bestMatch?.score ?? null,
        match_status: status,
        cooking_methods: methods,
        inferred_state: inferredState,
      });
    }
  }
  
  return results;
}

// ---------------------------------------------------------------------------
// Database persistence
// ---------------------------------------------------------------------------

async function persistAnalysis(analyses: IngredientAnalysis[]): Promise<void> {
  if (analyses.length === 0) return;
  
  const batchSize = 200;
  
  for (let i = 0; i < analyses.length; i += batchSize) {
    const batch = analyses.slice(i, i + batchSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIdx = 1;
    
    for (const a of batch) {
      placeholders.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
      values.push(
        a.recipe_id,
        a.ingredient_raw,
        a.canonical_slug,
        a.fdc_id,
        a.match_score,
        a.match_status,
        a.cooking_methods,
        a.inferred_state
      );
    }
    
    await db.query(`
      INSERT INTO recipe_ingredient_analysis 
        (recipe_id, ingredient_raw, canonical_slug, fdc_id, match_score, match_status, cooking_methods, inferred_state)
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (recipe_id, ingredient_raw) DO UPDATE SET
        canonical_slug = EXCLUDED.canonical_slug,
        fdc_id = EXCLUDED.fdc_id,
        match_score = EXCLUDED.match_score,
        match_status = EXCLUDED.match_status,
        cooking_methods = EXCLUDED.cooking_methods,
        inferred_state = EXCLUDED.inferred_state,
        created_at = NOW()
    `, values);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const tierIdx = args.indexOf("--tier");
  const tier = (tierIdx >= 0 ? args[tierIdx + 1] : "elite") as "elite" | "top" | "all";
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : undefined;
  const dryRun = args.includes("--dry-run");
  
  console.log(`\nAnalyze Food.com Recipes`);
  console.log(`  Tier: ${tier}`);
  console.log(`  Limit: ${limit || "none"}`);
  console.log(`  Dry run: ${dryRun}`);
  console.log("");
  
  // Load FDC foods and build IDF
  const fdcFoods = await loadFdcFoods();
  const idf = buildIdfWeights(fdcFoods);
  
  // Load recipes
  const recipes = await loadRecipes(tier, limit);
  
  // Analyze each recipe
  let totalAnalyses = 0;
  let mapped = 0;
  let needsReview = 0;
  let noMatch = 0;
  const methodCounts = new Map<string, number>();
  
  for (let i = 0; i < recipes.length; i++) {
    const recipe = recipes[i];
    const analyses = analyzeRecipe(recipe, fdcFoods, idf);
    
    for (const a of analyses) {
      totalAnalyses++;
      if (a.match_status === "mapped") mapped++;
      else if (a.match_status === "needs_review") needsReview++;
      else noMatch++;
      
      for (const method of a.cooking_methods) {
        methodCounts.set(method, (methodCounts.get(method) || 0) + 1);
      }
    }
    
    if (!dryRun) {
      await persistAnalysis(analyses);
    }
    
    if ((i + 1) % 100 === 0 || i === recipes.length - 1) {
      console.log(`  Processed ${i + 1}/${recipes.length} recipes (${totalAnalyses} ingredients)`);
    }
  }
  
  console.log("\n--- Summary ---");
  console.log(`Recipes processed: ${recipes.length}`);
  console.log(`Ingredients analyzed: ${totalAnalyses}`);
  console.log(`  Mapped: ${mapped} (${(100 * mapped / totalAnalyses).toFixed(1)}%)`);
  console.log(`  Needs review: ${needsReview} (${(100 * needsReview / totalAnalyses).toFixed(1)}%)`);
  console.log(`  No match: ${noMatch} (${(100 * noMatch / totalAnalyses).toFixed(1)}%)`);
  
  console.log("\nCooking methods found:");
  const sortedMethods = [...methodCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [method, count] of sortedMethods.slice(0, 15)) {
    console.log(`  ${method}: ${count}`);
  }
  
  if (!dryRun) {
    console.log("\nRefreshing materialized views...");
    await db.query("REFRESH MATERIALIZED VIEW canonical_method_stats");
    console.log("Done!");
  } else {
    console.log("\n(dry run - no data persisted)");
  }
  
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
