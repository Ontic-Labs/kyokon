#!/usr/bin/env npx tsx
/**
 * Identify non-food items and classify unmapped ingredients
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../src/lib/db";

// Non-food patterns - things that shouldn't be matched to any canonical
const NON_FOOD_PATTERNS = [
  // Packaging/equipment
  /reynolds\s*wrap/i,
  /aluminum\s*foil/i,
  /parchment\s*paper/i,
  /wax\s*paper/i,
  /plastic\s*wrap/i,
  /toothpicks?/i,
  /skewers?/i,
  /paper\s*towels?/i,
  /cheesecloth/i,
  /kitchen\s*string/i,
  /butcher'?s?\s*twine/i,
  /cooking\s*spray/i,
  /vegetable\s*oil\s*cooking\s*spray/i,
  
  // Decorative only
  /food\s*coloring/i,
  /sprinkles/i,
  /candles?/i,
  /decorat/i,
];

// Compound/multi-item ingredients that should map to multiple canonicals
// We'll handle these specially - they need expansion, not aliases
const COMPOUND_PATTERNS = [
  /salt\s*(and|&)\s*pepper/i,
  /salt\s*(and|&)\s*black\s*pepper/i,
];

function isNonFood(ingredient: string): boolean {
  for (const pattern of NON_FOOD_PATTERNS) {
    if (pattern.test(ingredient)) {
      return true;
    }
  }
  return false;
}

function isCompound(ingredient: string): boolean {
  for (const pattern of COMPOUND_PATTERNS) {
    if (pattern.test(ingredient)) {
      return true;
    }
  }
  return false;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(s: string): string {
  return normalize(s).replace(/\s+/g, "-");
}

async function main() {
  console.log("Loading data...\n");
  
  // Load recipes
  const recipes = await db.query<{ ingredients: string[] }>(
    "SELECT ingredients FROM canary_top_rated_recipes"
  );
  const allIngredients = recipes.rows.flatMap(r => r.ingredients);
  
  // Frequency count
  const freq = new Map<string, number>();
  for (const i of allIngredients) {
    freq.set(i, (freq.get(i) || 0) + 1);
  }
  
  // Load canonicals
  const canonicals = await db.query<{ canonical_slug: string; canonical_name: string }>(
    "SELECT canonical_slug, canonical_name FROM canonical_ingredient"
  );
  const slugSet = new Set(canonicals.rows.map(r => r.canonical_slug));
  const nameSet = new Set(canonicals.rows.map(r => normalize(r.canonical_name)));
  
  // Load aliases
  const aliases = await db.query<{ alias_norm: string }>(
    "SELECT alias_norm FROM canonical_ingredient_alias"
  );
  const aliasSet = new Set(aliases.rows.map(r => r.alias_norm));
  
  // Categorize
  const matched: Array<[string, number]> = [];
  const nonFoods: Array<[string, number]> = [];
  const compounds: Array<[string, number]> = [];
  const unmapped: Array<[string, number]> = [];
  
  for (const [ingredient, count] of freq.entries()) {
    const slug = slugify(ingredient);
    const norm = normalize(ingredient);
    const normLower = ingredient.toLowerCase().trim();
    
    if (isNonFood(ingredient)) {
      nonFoods.push([ingredient, count]);
    } else if (isCompound(ingredient)) {
      compounds.push([ingredient, count]);
    } else if (slugSet.has(slug) || nameSet.has(norm) || aliasSet.has(normLower)) {
      matched.push([ingredient, count]);
    } else {
      unmapped.push([ingredient, count]);
    }
  }
  
  // Sort by frequency
  nonFoods.sort((a, b) => b[1] - a[1]);
  compounds.sort((a, b) => b[1] - a[1]);
  unmapped.sort((a, b) => b[1] - a[1]);
  matched.sort((a, b) => b[1] - a[1]);
  
  const total = allIngredients.length;
  const matchedCount = matched.reduce((s, [_, c]) => s + c, 0);
  const nonFoodCount = nonFoods.reduce((s, [_, c]) => s + c, 0);
  const compoundCount = compounds.reduce((s, [_, c]) => s + c, 0);
  const unmappedCount = unmapped.reduce((s, [_, c]) => s + c, 0);
  
  console.log("=== Summary ===");
  console.log(`Total ingredient occurrences: ${total}`);
  console.log(`  Matched: ${matchedCount} (${(100 * matchedCount / total).toFixed(1)}%)`);
  console.log(`  Compounds: ${compoundCount} (${(100 * compoundCount / total).toFixed(1)}%) - expand to multiple canonicals`);
  console.log(`  Non-food: ${nonFoodCount} (${(100 * nonFoodCount / total).toFixed(1)}%)`);
  console.log(`  Unmapped: ${unmappedCount} (${(100 * unmappedCount / total).toFixed(1)}%)`);
  
  console.log(`\n=== Compounds (${compounds.length} unique) - need expansion ===`);
  for (const [name, count] of compounds.slice(0, 10)) {
    console.log(`  ${count.toString().padStart(4)} | ${name}`);
  }
  
  console.log(`\n=== Non-Foods Detected (${nonFoods.length} unique) ===`);
  for (const [name, count] of nonFoods.slice(0, 20)) {
    console.log(`  ${count.toString().padStart(4)} | ${name}`);
  }
  
  console.log(`\n=== Top 50 Unmapped (need canonicals or aliases) ===`);
  for (const [name, count] of unmapped.slice(0, 50)) {
    console.log(`  ${count.toString().padStart(4)} | ${name}`);
  }
  
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
