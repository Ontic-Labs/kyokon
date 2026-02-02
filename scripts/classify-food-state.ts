/**
 * Food State Classification Script
 *
 * Parses food descriptions to extract state classification along four axes:
 *   1. cooking_state: unknown / raw / cooked
 *   2. cooking_methods[]: roasted, grilled, fried, etc.
 *   3. preservation: unknown / fresh / frozen / canned / etc.
 *   4. processing: unknown / whole / ground / sliced / etc.
 *
 * Usage:
 *   npx tsx scripts/classify-food-state.ts
 */

import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const VERSION = "1.0.0";
const BATCH_SIZE = 500;

// Pattern definitions
const COOKING_METHODS = [
  "roasted",
  "grilled",
  "fried",
  "baked",
  "steamed",
  "boiled",
  "braised",
  "sauteed",
  "sautéed",
  "broiled",
  "poached",
  "simmered",
  "stir-fried",
  "stir fried",
  "pan-fried",
  "pan fried",
  "deep-fried",
  "deep fried",
  "microwaved",
  "toasted",
  "blanched",
  "charbroiled",
  "blackened",
  "seared",
  "caramelized",
  "stewed",
  "barbecued",
  "bbq",
] as const;

const RAW_TOKENS = ["raw", "uncooked", "fresh-cut"] as const;
const COOKED_TOKENS = ["cooked", "heated", "reheated", "prepared"] as const;

const PRESERVATION_MAP: Record<string, string> = {
  frozen: "frozen",
  canned: "canned",
  dried: "dried",
  "dry-roasted": "dried",
  "dry roasted": "dried",
  dehydrated: "dried",
  cured: "cured",
  "salt-cured": "cured",
  brined: "cured",
  corned: "cured",
  pickled: "pickled",
  fermented: "fermented",
  smoked: "smoked",
  "shelf-stable": "shelf_stable",
  preserved: "shelf_stable",
};

const PROCESSING_MAP: Record<string, string> = {
  whole: "whole",
  ground: "ground",
  minced: "ground",
  sliced: "sliced",
  diced: "diced",
  cubed: "diced",
  chopped: "diced",
  shredded: "shredded",
  grated: "shredded",
  pureed: "pureed",
  puréed: "pureed",
  mashed: "pureed",
  paste: "paste",
  powder: "powder",
  powdered: "powder",
  flour: "flour",
  meal: "flour",
  juice: "juice",
  juiced: "juice",
  oil: "oil",
  broth: "broth",
  stock: "stock",
  extract: "oil",
  concentrate: "juice",
  condensed: "juice",
};

interface FoodState {
  fdcId: number;
  cookingState: "unknown" | "raw" | "cooked";
  cookingMethods: string[];
  preservation: string;
  processing: string;
  sourceTokens: string[];
}

function classifyFood(fdcId: number, description: string): FoodState {
  const desc = description.toLowerCase();
  const tokens: string[] = [];

  let cookingState: "unknown" | "raw" | "cooked" = "unknown";
  const cookingMethods: string[] = [];
  let preservation = "unknown";
  let processing = "unknown";

  // Check for raw tokens
  for (const token of RAW_TOKENS) {
    const regex = new RegExp(`\\b${token}\\b`, "i");
    if (regex.test(desc)) {
      cookingState = "raw";
      tokens.push(token);
      break;
    }
  }

  // Check for cooking methods (implies cooked)
  for (const method of COOKING_METHODS) {
    const regex = new RegExp(`\\b${method.replace(/-/g, "[- ]?")}\\b`, "i");
    if (regex.test(desc)) {
      cookingState = "cooked";
      cookingMethods.push(method.replace(/[- ]/g, "_"));
      tokens.push(method);
    }
  }

  // Check for generic cooked tokens (only if no specific method found)
  if (cookingState !== "cooked") {
    for (const token of COOKED_TOKENS) {
      const regex = new RegExp(`\\b${token}\\b`, "i");
      if (regex.test(desc)) {
        cookingState = "cooked";
        tokens.push(token);
        break;
      }
    }
  }

  // Check preservation
  for (const [token, value] of Object.entries(PRESERVATION_MAP)) {
    const regex = new RegExp(`\\b${token.replace(/-/g, "[- ]?")}\\b`, "i");
    if (regex.test(desc)) {
      preservation = value;
      tokens.push(token);
      break; // Take first match (order matters)
    }
  }

  // Check processing
  for (const [token, value] of Object.entries(PROCESSING_MAP)) {
    const regex = new RegExp(`\\b${token}\\b`, "i");
    if (regex.test(desc)) {
      processing = value;
      tokens.push(token);
      break; // Take first match
    }
  }

  return {
    fdcId,
    cookingState,
    cookingMethods,
    preservation,
    processing,
    sourceTokens: [...new Set(tokens)], // dedupe
  };
}

async function main(): Promise<void> {
  console.log("=== Food State Classification ===\n");
  console.log(`Version: ${VERSION}\n`);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });

  const client = await pool.connect();

  try {
    // Load all foods
    console.log("Loading foods...");
    const result = await client.query<{ fdc_id: number; description: string }>(
      "SELECT fdc_id, description FROM foods ORDER BY fdc_id"
    );
    console.log(`  Loaded ${result.rows.length} foods\n`);

    // Classify all foods
    console.log("Classifying food states...");
    const states: FoodState[] = result.rows.map((row) =>
      classifyFood(row.fdc_id, row.description)
    );

    // Stats
    const stats = {
      raw: states.filter((s) => s.cookingState === "raw").length,
      cooked: states.filter((s) => s.cookingState === "cooked").length,
      unknown: states.filter((s) => s.cookingState === "unknown").length,
      withMethods: states.filter((s) => s.cookingMethods.length > 0).length,
      preserved: states.filter((s) => s.preservation !== "unknown").length,
      processed: states.filter((s) => s.processing !== "unknown").length,
    };

    console.log(`\nCooking state breakdown:`);
    console.log(`  raw: ${stats.raw}`);
    console.log(`  cooked: ${stats.cooked}`);
    console.log(`  unknown: ${stats.unknown}`);
    console.log(`\n  with cooking methods: ${stats.withMethods}`);
    console.log(`  with preservation: ${stats.preserved}`);
    console.log(`  with processing: ${stats.processed}`);

    // Insert into database
    console.log("\nSaving to database...");
    await client.query("BEGIN");

    // Clear existing data
    await client.query("TRUNCATE food_state");

    // Batch insert
    for (let i = 0; i < states.length; i += BATCH_SIZE) {
      const batch = states.slice(i, i + BATCH_SIZE);
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let idx = 1;

      for (const s of batch) {
        placeholders.push(
          `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, NOW(), $${idx + 6})`
        );
        values.push(
          s.fdcId,
          s.cookingState,
          s.cookingMethods,
          s.preservation,
          s.processing,
          s.sourceTokens,
          VERSION
        );
        idx += 7;
      }

      await client.query(
        `INSERT INTO food_state 
         (fdc_id, cooking_state, cooking_methods, preservation, processing, source_tokens, assessed_at, assessment_version)
         VALUES ${placeholders.join(", ")}`,
        values
      );
    }

    await client.query("COMMIT");
    console.log("Done!\n");

    // Show examples
    console.log("--- Examples ---");
    const examples = [
      states.find((s) => s.cookingState === "raw" && s.sourceTokens.length > 0),
      states.find((s) => s.cookingMethods.includes("grilled")),
      states.find((s) => s.preservation === "frozen"),
      states.find((s) => s.processing === "ground"),
      states.find((s) => s.cookingState === "unknown" && s.preservation === "unknown"),
    ];

    for (const s of examples) {
      if (s) {
        const food = result.rows.find((r) => r.fdc_id === s.fdcId);
        console.log(`  ${food?.description}`);
        console.log(`    state=${s.cookingState}, methods=[${s.cookingMethods.join(",")}], preservation=${s.preservation}, processing=${s.processing}`);
        console.log(`    tokens: [${s.sourceTokens.join(", ")}]\n`);
      }
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
