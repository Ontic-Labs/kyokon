#!/usr/bin/env npx tsx
/**
 * Analyze Food.com recipes v2: Match against canonical ingredients
 * 
 * Usage:
 *   npx tsx scripts/analyze-foodcom-v2.ts [--tier elite|top|all] [--limit N] [--dry-run]
 * 
 * This script matches Food.com ingredient strings against:
 *   1. canonical_ingredient.canonical_slug (exact match)
 *   2. canonical_ingredient_alias.alias_norm (fuzzy match)
 *   3. Falls back to lexical scoring against canonical_ingredient.canonical_name
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../src/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CanonicalIngredient {
  canonical_id: string;
  canonical_name: string;
  canonical_slug: string;
  canonical_rank: number;
  total_count: number;
}

interface CanonicalAlias {
  canonical_id: string;
  alias_norm: string;
}

interface RecipeRow {
  recipe_id: number;
  name: string;
  ingredients: string[];
  steps: string[];
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")  // Remove punctuation except hyphens
    .replace(/\s+/g, " ")       // Collapse whitespace
    .trim();
}

function slugify(s: string): string {
  return normalize(s).replace(/\s+/g, "-");
}

// ---------------------------------------------------------------------------
// Cooking method extraction (same as before)
// ---------------------------------------------------------------------------

const COOKING_METHOD_MAP = new Map<string, string>([
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
  ["saute", "sauteed"], ["sautes", "sauteed"], ["sauteing", "sauteed"],
  ["sauté", "sauteed"], ["sautés", "sauteed"], ["sautéing", "sauteed"],
  ["scramble", "scrambled"], ["scrambles", "scrambled"], ["scrambling", "scrambled"],
  ["simmer", "simmered"], ["simmers", "simmered"], ["simmering", "simmered"],
  ["steam", "steamed"], ["steams", "steamed"], ["steaming", "steamed"],
  ["toast", "toasted"], ["toasts", "toasted"], ["toasting", "toasted"],
  // Past tense → past tense
  ["baked", "baked"], ["blanched", "blanched"], ["boiled", "boiled"],
  ["braised", "braised"], ["broiled", "broiled"], ["fried", "fried"],
  ["grilled", "grilled"], ["microwaved", "microwaved"], ["poached", "poached"],
  ["roasted", "roasted"], ["sauteed", "sauteed"], ["scrambled", "scrambled"],
  ["simmered", "simmered"], ["steamed", "steamed"], ["toasted", "toasted"],
]);

function extractCookingMethods(steps: string[]): string[] {
  const methods = new Set<string>();
  const text = steps.join(" ").toLowerCase();
  const words = text.split(/\s+/);
  
  for (const word of words) {
    const normalized = COOKING_METHOD_MAP.get(word);
    if (normalized) {
      methods.add(normalized);
    }
  }
  
  return [...methods].sort();
}

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

async function loadCanonicals(): Promise<{
  bySlug: Map<string, CanonicalIngredient>;
  byAlias: Map<string, string>;  // alias_norm → canonical_id
  all: CanonicalIngredient[];
}> {
  console.log("Loading canonical ingredients...");
  
  // Load all canonicals
  const canonicals = await db.query<CanonicalIngredient>(`
    SELECT canonical_id, canonical_name, canonical_slug, canonical_rank, total_count
    FROM canonical_ingredient
    ORDER BY canonical_rank
  `);
  
  // Load all aliases
  const aliases = await db.query<CanonicalAlias>(`
    SELECT canonical_id, alias_norm
    FROM canonical_ingredient_alias
  `);
  
  const bySlug = new Map<string, CanonicalIngredient>();
  const byAlias = new Map<string, string>();
  
  for (const c of canonicals.rows) {
    bySlug.set(c.canonical_slug, c);
    // Also index by name normalized
    bySlug.set(normalize(c.canonical_name).replace(/\s+/g, "-"), c);
  }
  
  for (const a of aliases.rows) {
    byAlias.set(a.alias_norm, a.canonical_id);
  }
  
  console.log(`  Loaded ${canonicals.rows.length} canonicals, ${aliases.rows.length} aliases`);
  
  return {
    bySlug,
    byAlias,
    all: canonicals.rows,
  };
}

interface MatchResult {
  canonical_id: string | null;
  canonical_slug: string | null;
  match_score: number;
  match_status: "mapped" | "needs_review" | "no_match";
  match_reason: string;
}

function matchIngredient(
  raw: string,
  canonicals: {
    bySlug: Map<string, CanonicalIngredient>;
    byAlias: Map<string, string>;
    all: CanonicalIngredient[];
  }
): MatchResult {
  const norm = normalize(raw);
  const slug = slugify(raw);
  
  // 1. Exact slug match
  const exactMatch = canonicals.bySlug.get(slug);
  if (exactMatch) {
    return {
      canonical_id: exactMatch.canonical_id,
      canonical_slug: exactMatch.canonical_slug,
      match_score: 1.0,
      match_status: "mapped",
      match_reason: "exact_slug",
    };
  }
  
  // 2. Alias match
  const aliasCanonicalId = canonicals.byAlias.get(norm);
  if (aliasCanonicalId) {
    const canonical = canonicals.all.find(c => c.canonical_id === aliasCanonicalId);
    if (canonical) {
      return {
        canonical_id: canonical.canonical_id,
        canonical_slug: canonical.canonical_slug,
        match_score: 0.95,
        match_status: "mapped",
        match_reason: "alias",
      };
    }
  }
  
  // 3. Fuzzy match: check if input tokens are subset of canonical name
  const inputTokens = new Set(norm.split(/\s+/).filter(t => t.length > 2));
  let bestMatch: CanonicalIngredient | null = null;
  let bestScore = 0;
  
  for (const c of canonicals.all) {
    const canonicalTokens = new Set(normalize(c.canonical_name).split(/\s+/));
    
    // Count how many input tokens match canonical tokens
    let matchCount = 0;
    for (const t of inputTokens) {
      if (canonicalTokens.has(t)) {
        matchCount++;
      }
    }
    
    if (inputTokens.size === 0) continue;
    
    // Score based on overlap ratio
    const score = matchCount / inputTokens.size;
    
    // Prefer higher-ranked canonicals (lower rank = more common)
    const rankBonus = score > 0.5 ? (1 - c.canonical_rank / 3000) * 0.05 : 0;
    const finalScore = score + rankBonus;
    
    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestMatch = c;
    }
  }
  
  if (bestMatch && bestScore >= 0.75) {
    return {
      canonical_id: bestMatch.canonical_id,
      canonical_slug: bestMatch.canonical_slug,
      match_score: bestScore,
      match_status: "mapped",
      match_reason: "token_overlap",
    };
  }
  
  if (bestMatch && bestScore >= 0.40) {
    return {
      canonical_id: bestMatch.canonical_id,
      canonical_slug: bestMatch.canonical_slug,
      match_score: bestScore,
      match_status: "needs_review",
      match_reason: "token_overlap_partial",
    };
  }
  
  return {
    canonical_id: null,
    canonical_slug: null,
    match_score: bestScore,
    match_status: "no_match",
    match_reason: "no_match",
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const tier = args.includes("--tier") ? args[args.indexOf("--tier") + 1] : "elite";
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : undefined;
  const dryRun = args.includes("--dry-run");

  console.log(`\nAnalyze Food.com Recipes v2 (Canonical Matching)`);
  console.log(`  Tier: ${tier}`);
  console.log(`  Limit: ${limit ?? "none"}`);
  console.log(`  Dry run: ${dryRun}\n`);

  // Load canonical data
  const canonicals = await loadCanonicals();

  // Load recipes
  let query = "";
  if (tier === "elite") {
    query = "SELECT recipe_id, name, ingredients, steps FROM canary_elite_recipes";
  } else if (tier === "top") {
    query = "SELECT recipe_id, name, ingredients, steps FROM canary_top_rated_recipes";
  } else {
    query = "SELECT recipe_id, name, ingredients, steps FROM foodcom_recipes";
  }
  if (limit) {
    query += ` LIMIT ${limit}`;
  }

  console.log(`Loading recipes (tier=${tier}, limit=${limit ?? "none"})...`);
  const recipes = await db.query<RecipeRow>(query);
  console.log(`  Loaded ${recipes.rows.length} recipes`);

  // Process
  const stats = {
    recipes: 0,
    ingredients: 0,
    mapped: 0,
    needs_review: 0,
    no_match: 0,
    methods: new Map<string, number>(),
  };

  const results: Array<{
    recipe_id: number;
    ingredient_raw: string;
    canonical_slug: string | null;
    match_score: number;
    match_status: string;
    match_reason: string;
    cooking_methods: string[];
  }> = [];

  for (const recipe of recipes.rows) {
    stats.recipes++;
    const methods = extractCookingMethods(recipe.steps);
    
    for (const m of methods) {
      stats.methods.set(m, (stats.methods.get(m) || 0) + 1);
    }

    for (const raw of recipe.ingredients) {
      stats.ingredients++;
      const match = matchIngredient(raw, canonicals);
      
      if (match.match_status === "mapped") stats.mapped++;
      else if (match.match_status === "needs_review") stats.needs_review++;
      else stats.no_match++;

      results.push({
        recipe_id: recipe.recipe_id,
        ingredient_raw: raw,
        canonical_slug: match.canonical_slug,
        match_score: match.match_score,
        match_status: match.match_status,
        match_reason: match.match_reason,
        cooking_methods: methods,
      });
    }
  }

  console.log(`  Processed ${stats.recipes} recipes (${stats.ingredients} ingredients)\n`);

  // Report
  console.log("--- Summary ---");
  console.log(`Recipes processed: ${stats.recipes}`);
  console.log(`Ingredients analyzed: ${stats.ingredients}`);
  console.log(`  Mapped: ${stats.mapped} (${(100 * stats.mapped / stats.ingredients).toFixed(1)}%)`);
  console.log(`  Needs review: ${stats.needs_review} (${(100 * stats.needs_review / stats.ingredients).toFixed(1)}%)`);
  console.log(`  No match: ${stats.no_match} (${(100 * stats.no_match / stats.ingredients).toFixed(1)}%)`);

  console.log("\nCooking methods found:");
  const sortedMethods = [...stats.methods.entries()].sort((a, b) => b[1] - a[1]);
  for (const [method, count] of sortedMethods) {
    console.log(`  ${method}: ${count}`);
  }

  // Show some unmapped examples
  const unmapped = results.filter(r => r.match_status !== "mapped").slice(0, 20);
  if (unmapped.length > 0) {
    console.log("\nSample unmapped ingredients:");
    for (const u of unmapped) {
      console.log(`  ${u.match_score.toFixed(2)} | ${u.ingredient_raw.slice(0, 40)}`);
    }
  }

  if (dryRun) {
    console.log("\n(dry run - no data persisted)");
  } else {
    // Persist to database
    console.log("\nPersisting results...");
    
    let persisted = 0;
    const batchSize = 100;
    
    for (let i = 0; i < results.length; i += batchSize) {
      const batch = results.slice(i, i + batchSize);
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let paramIdx = 1;
      
      for (const r of batch) {
        placeholders.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
        values.push(
          r.recipe_id,
          r.ingredient_raw,
          r.canonical_slug,
          null, // fdc_id - we'll populate later if needed
          r.match_score,
          r.match_status,
          r.cooking_methods.length > 0 ? r.cooking_methods : null
        );
      }
      
      await db.query(`
        INSERT INTO recipe_ingredient_analysis 
          (recipe_id, ingredient_raw, canonical_slug, fdc_id, match_score, match_status, cooking_methods)
        VALUES ${placeholders.join(", ")}
        ON CONFLICT (recipe_id, ingredient_raw) DO UPDATE SET
          canonical_slug = EXCLUDED.canonical_slug,
          match_score = EXCLUDED.match_score,
          match_status = EXCLUDED.match_status,
          cooking_methods = EXCLUDED.cooking_methods
      `, values);
      
      persisted += batch.length;
    }
    
    console.log(`  Persisted ${persisted} ingredient analyses`);
    
    // Refresh materialized view
    console.log("  Refreshing canonical_method_stats...");
    await db.query("REFRESH MATERIALIZED VIEW canonical_method_stats");
  }

  console.log("\nDone!");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
