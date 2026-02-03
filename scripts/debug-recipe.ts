import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../src/lib/db";

async function main() {
  console.log("=== Data Integrity Check ===\n");
  
  // Check recipes have required fields
  const nullCheck = await db.query(`
    SELECT 
      COUNT(*) FILTER (WHERE name IS NULL) as null_name,
      COUNT(*) FILTER (WHERE ingredients IS NULL) as null_ingredients,
      COUNT(*) FILTER (WHERE steps IS NULL) as null_steps,
      COUNT(*) FILTER (WHERE jsonb_array_length(ingredients::jsonb) = 0) as empty_ingredients,
      COUNT(*) FILTER (WHERE jsonb_array_length(steps::jsonb) = 0) as empty_steps,
      COUNT(*) as total
    FROM foodcom_recipes
  `);
  const nc = nullCheck.rows[0];
  console.log("Recipes:", nc.total);
  console.log("  Null name:", nc.null_name);
  console.log("  Null ingredients:", nc.null_ingredients);
  console.log("  Null steps:", nc.null_steps);
  console.log("  Empty ingredients:", nc.empty_ingredients);
  console.log("  Empty steps:", nc.empty_steps);
  
  // Check analysis coverage
  const analysisCheck = await db.query(`
    SELECT 
      COUNT(DISTINCT recipe_id) as recipes_analyzed,
      COUNT(*) as total_ingredients,
      COUNT(*) FILTER (WHERE match_status = 'mapped') as mapped,
      COUNT(*) FILTER (WHERE match_status = 'needs_review') as needs_review,
      COUNT(*) FILTER (WHERE match_status = 'no_match') as no_match
    FROM recipe_ingredient_analysis
  `);
  const ac = analysisCheck.rows[0];
  console.log("\nAnalysis:");
  console.log("  Recipes analyzed:", ac.recipes_analyzed);
  console.log("  Total ingredients:", ac.total_ingredients);
  console.log("  Mapped:", ac.mapped, `(${(100*ac.mapped/ac.total_ingredients).toFixed(1)}%)`);
  console.log("  Needs review:", ac.needs_review);
  console.log("  No match:", ac.no_match);
  
  // Sample a recipe to verify data looks correct
  const sample = await db.query(`
    SELECT recipe_id, name, 
           jsonb_array_length(ingredients::jsonb) as ing_count,
           jsonb_array_length(steps::jsonb) as step_count
    FROM foodcom_recipes 
    ORDER BY random() 
    LIMIT 3
  `);
  console.log("\nSample recipes:");
  for (const r of sample.rows) {
    console.log(`  ${r.recipe_id}: "${r.name}" (${r.ing_count} ingredients, ${r.step_count} steps)`);
  }
  
  process.exit(0);
}

main();
