#!/usr/bin/env npx tsx
/**
 * Diagnose why ingredients are failing to map
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
  ProcessedFdcFood,
} from "../src/lib/lexical-scorer";

async function main() {
  // Load FDC foods
  console.log("Loading FDC foods...");
  const result = await db.query<{
    fdc_id: number;
    description: string;
    data_type: string;
    category_name: string | null;
  }>(`
    SELECT f.fdc_id, f.description, f.data_type, c.name AS category_name
    FROM foods f
    LEFT JOIN food_categories c ON f.category_id = c.category_id
    WHERE f.data_type IN ('sr_legacy', 'foundation')
  `);
  
  const fdcFoods = result.rows.map(r => 
    processFdcFood(r.fdc_id, r.description, r.data_type as "sr_legacy" | "foundation", r.category_name)
  );
  const idf = buildIdfWeights(fdcFoods);
  console.log(`  Loaded ${fdcFoods.length} FDC foods`);

  // Get all ingredients from elite recipes
  console.log("\nLoading elite recipe ingredients...");
  const recipes = await db.query<{ ingredients: string[] }>(
    `SELECT ingredients FROM canary_elite_recipes`
  );
  const allIngredients = recipes.rows.flatMap(r => r.ingredients);
  console.log(`  ${allIngredients.length} total ingredients`);

  // Deduplicate
  const unique = [...new Set(allIngredients)];
  console.log(`  ${unique.length} unique ingredients`);

  // Score each
  const failures: Array<{
    raw: string;
    bestScore: number;
    bestMatch: string;
    status: string;
  }> = [];

  for (const raw of unique) {
    const processed = processIngredient(raw, idf);
    let bestScore = 0;
    let bestMatch = "";
    
    for (const fdc of fdcFoods) {
      const score = scoreCandidate(processed, fdc, idf).score;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = fdc.description;
      }
    }
    
    const status = classifyScore(bestScore);
    if (status !== "mapped") {
      failures.push({ raw, bestScore, bestMatch, status });
    }
  }

  // Sort by score descending (closest to threshold first)
  failures.sort((a, b) => b.bestScore - a.bestScore);

  console.log(`\n=== ${failures.length} UNMAPPED (of ${unique.length} unique) ===\n`);
  console.log("Top 50 near-misses (highest scores that still failed):\n");
  console.log("Score  | Status       | Ingredient                               | Best FDC Match");
  console.log("-------|--------------|------------------------------------------|------------------------------------------");
  
  for (const f of failures.slice(0, 50)) {
    const score = f.bestScore.toFixed(3);
    const status = f.status.padEnd(12);
    const ingr = f.raw.slice(0, 40).padEnd(40);
    const match = f.bestMatch.slice(0, 40);
    console.log(`${score} | ${status} | ${ingr} | ${match}`);
  }

  // Show score distribution
  console.log("\n=== Score Distribution ===");
  const buckets = [0.7, 0.65, 0.6, 0.55, 0.5, 0.4, 0.3, 0];
  for (let i = 0; i < buckets.length - 1; i++) {
    const high = buckets[i];
    const low = buckets[i + 1];
    const count = failures.filter(f => f.bestScore >= low && f.bestScore < high).length;
    console.log(`  ${low.toFixed(2)}-${high.toFixed(2)}: ${count}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
