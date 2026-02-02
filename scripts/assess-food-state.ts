/**
 * Food State Assessment Script
 *
 * Extracts cooking state, cooking methods, preservation, and processing
 * from food descriptions. Only asserts state when explicitly supported
 * by description tokens — defaults are 'unknown', never 'raw'/'fresh'.
 *
 * Usage:
 *   npx tsx scripts/assess-food-state.ts
 *
 * Axes:
 *   1. cooking_state: unknown | raw | cooked
 *   2. cooking_methods[]: multi-valued (roasted, grilled, etc.)
 *   3. preservation: unknown | fresh | frozen | canned | ...
 *   4. processing: unknown | whole | ground | sliced | ...
 */

import { Pool, PoolClient } from "pg";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const ASSESSMENT_VERSION = "1.0.0";

// ============================================
// Token extraction rules
// ============================================

// Cooking state: explicit raw indicators
const RAW_PATTERNS: Array<{ regex: RegExp; token: string }> = [
  { regex: /\braw\b/i, token: "raw" },
  { regex: /\buncooked\b/i, token: "uncooked" },
  { regex: /\bunprepared\b/i, token: "unprepared" },
];

// Cooking methods: specific methods checked BEFORE generic "cooked"
// Order matters: compound forms (pan-fried, stir-fried, deep-fried) before generic "fried"
const COOKING_METHOD_PATTERNS: Array<{
  regex: RegExp;
  method: string;
  token: string;
}> = [
  { regex: /\bpan[- ]fried\b/i, method: "pan_fried", token: "pan-fried" },
  { regex: /\bstir[- ]fried\b/i, method: "stir_fried", token: "stir-fried" },
  { regex: /\bdeep[- ]fried\b/i, method: "deep_fried", token: "deep-fried" },
  { regex: /\broasted\b/i, method: "roasted", token: "roasted" },
  { regex: /\bgrilled\b/i, method: "grilled", token: "grilled" },
  { regex: /\bfried\b/i, method: "fried", token: "fried" },
  { regex: /\bbaked\b/i, method: "baked", token: "baked" },
  { regex: /\bsteamed\b/i, method: "steamed", token: "steamed" },
  { regex: /\bboiled\b/i, method: "boiled", token: "boiled" },
  { regex: /\bbraised\b/i, method: "braised", token: "braised" },
  { regex: /\bbroiled\b/i, method: "broiled", token: "broiled" },
  { regex: /\bsaut[ée]ed\b/i, method: "sauteed", token: "sauteed" },
  { regex: /\bstewed\b/i, method: "stewed", token: "stewed" },
  { regex: /\bpoached\b/i, method: "poached", token: "poached" },
  { regex: /\btoasted\b/i, method: "toasted", token: "toasted" },
  { regex: /\bblanched\b/i, method: "blanched", token: "blanched" },
  { regex: /\bmicrowaved\b/i, method: "microwaved", token: "microwaved" },
  { regex: /\bsmoked\b/i, method: "smoked", token: "smoked" },
  { regex: /\bscrambled\b/i, method: "scrambled", token: "scrambled" },
  { regex: /\bsimmered\b/i, method: "simmered", token: "simmered" },
];

// Generic "cooked" — sets cooking_state but no specific method
const GENERIC_COOKED_PATTERN = /\bcooked\b/i;
const GENERIC_PREPARED_PATTERN = /\bprepared\b/i;

// Preservation patterns (independent axis)
// "dry roasted" and "dry heat" should NOT trigger "dried"
const PRESERVATION_PATTERNS: Array<{
  regex: RegExp;
  value: string;
  token: string;
}> = [
  { regex: /\bfresh\b/i, value: "fresh", token: "fresh" },
  { regex: /\bfrozen\b/i, value: "frozen", token: "frozen" },
  { regex: /\bcanned\b/i, value: "canned", token: "canned" },
  {
    regex: /\bfreeze[- ]dried\b/i,
    value: "dried",
    token: "freeze-dried",
  },
  { regex: /\bdehydrated\b/i, value: "dried", token: "dehydrated" },
  { regex: /\bdried\b/i, value: "dried", token: "dried" },
  { regex: /\bcured\b/i, value: "cured", token: "cured" },
  { regex: /\bpickled\b/i, value: "pickled", token: "pickled" },
  { regex: /\bfermented\b/i, value: "fermented", token: "fermented" },
];

// Processing patterns (independent axis)
const PROCESSING_PATTERNS: Array<{
  regex: RegExp;
  value: string;
  token: string;
}> = [
  { regex: /\bground\b/i, value: "ground", token: "ground" },
  { regex: /\bminced\b/i, value: "ground", token: "minced" },
  { regex: /\bsliced\b/i, value: "sliced", token: "sliced" },
  { regex: /\bdiced\b/i, value: "diced", token: "diced" },
  { regex: /\bshredded\b/i, value: "shredded", token: "shredded" },
  { regex: /\bgrated\b/i, value: "shredded", token: "grated" },
  { regex: /\bpuree[d]?\b/i, value: "pureed", token: "pureed" },
  { regex: /\bpaste\b/i, value: "paste", token: "paste" },
  { regex: /\bpowder\b/i, value: "powder", token: "powder" },
  { regex: /\bflour\b/i, value: "flour", token: "flour" },
  { regex: /\bjuice\b/i, value: "juice", token: "juice" },
  { regex: /\boil\b/i, value: "oil", token: "oil" },
  { regex: /\bbroth\b/i, value: "broth", token: "broth" },
  { regex: /\bstock\b/i, value: "stock", token: "stock" },
];

// ============================================
// Assessment types
// ============================================

interface FoodState {
  fdcId: number;
  cookingState: "unknown" | "raw" | "cooked";
  cookingMethods: string[];
  preservation: string;
  processing: string;
  sourceTokens: string[];
}

// ============================================
// Extraction logic
// ============================================

function assessFoodState(fdcId: number, description: string): FoodState {
  const state: FoodState = {
    fdcId,
    cookingState: "unknown",
    cookingMethods: [],
    preservation: "unknown",
    processing: "unknown",
    sourceTokens: [],
  };

  // --- Axis 1 & 2: Cooking state + methods ---

  // Check for explicit raw indicators
  let isExplicitlyRaw = false;
  for (const { regex, token } of RAW_PATTERNS) {
    if (regex.test(description)) {
      isExplicitlyRaw = true;
      state.sourceTokens.push(token);
      break;
    }
  }

  // Check for cooking methods (collect ALL that match)
  const methods: string[] = [];
  for (const { regex, method, token } of COOKING_METHOD_PATTERNS) {
    if (regex.test(description)) {
      // Skip "fried" if a compound form already matched
      if (
        method === "fried" &&
        methods.some((m) =>
          ["pan_fried", "stir_fried", "deep_fried"].includes(m)
        )
      ) {
        continue;
      }
      methods.push(method);
      state.sourceTokens.push(token);
    }
  }

  // Check for generic "cooked" or "prepared" keywords
  const hasGenericCooked = GENERIC_COOKED_PATTERN.test(description);
  const hasGenericPrepared = GENERIC_PREPARED_PATTERN.test(description);
  if (hasGenericCooked) state.sourceTokens.push("cooked");
  if (hasGenericPrepared) state.sourceTokens.push("prepared");

  // Resolve cooking_state
  if (isExplicitlyRaw && methods.length === 0 && !hasGenericCooked) {
    // Explicitly raw, no cooking methods
    state.cookingState = "raw";
  } else if (methods.length > 0 || hasGenericCooked || hasGenericPrepared) {
    // Any cooking evidence → cooked
    state.cookingState = "cooked";
    state.cookingMethods = methods;
  } else if (isExplicitlyRaw) {
    // "raw" appeared but so did cooking methods — conflict
    // This is rare; default to unknown and let source_tokens record both
    state.cookingState = "unknown";
  }
  // else: no cooking keywords at all → stays "unknown"

  // --- Axis 3: Preservation ---

  // "smoked" is dual: if it appeared as a cooking method AND there's another
  // cooking method, treat smoked as preservation. If smoked is the only
  // cooking-like keyword, it stays as a cooking method only.
  const smokedAsMethod = methods.includes("smoked");
  const hasOtherMethods = methods.some((m) => m !== "smoked");

  // Check explicit preservation patterns
  // Pre-check: "dry roasted" / "dry heat" contain "dried" as a substring
  // but do NOT indicate drying as a preservation method
  const hasDryCompound =
    /\bdry\s+roast/i.test(description) ||
    /\bdry\s+heat/i.test(description);

  for (const { regex, value, token } of PRESERVATION_PATTERNS) {
    if (regex.test(description)) {
      // "dried" only counts if it's not solely from "dry roasted"/"dry heat"
      if (token === "dried" && hasDryCompound) {
        // Check for a standalone comma-separated "dried" token
        // FDC format: "Corn, dried, yellow" vs "Nuts, dry roasted"
        if (!/,\s*dried\b/i.test(description) && !/\bdried,/i.test(description)) {
          continue;
        }
      }
      state.preservation = value;
      if (!state.sourceTokens.includes(token)) {
        state.sourceTokens.push(token);
      }
      break; // First preservation match wins
    }
  }

  // Handle smoked as preservation when another cooking method is present
  if (
    smokedAsMethod &&
    hasOtherMethods &&
    state.preservation === "unknown"
  ) {
    state.preservation = "smoked";
    // Remove smoked from cooking methods since it's preservation here
    state.cookingMethods = state.cookingMethods.filter(
      (m) => m !== "smoked"
    );
  }

  // --- Axis 4: Processing ---

  for (const { regex, value, token } of PROCESSING_PATTERNS) {
    if (regex.test(description)) {
      state.processing = value;
      if (!state.sourceTokens.includes(token)) {
        state.sourceTokens.push(token);
      }
      break; // First processing match wins
    }
  }

  return state;
}

// ============================================
// Database
// ============================================

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return new Pool({ connectionString, max: 5 });
}

async function loadFoods(
  client: PoolClient
): Promise<Array<{ fdcId: number; description: string }>> {
  const result = await client.query<{
    fdc_id: number;
    description: string;
  }>(`SELECT fdc_id, description FROM foods ORDER BY fdc_id`);

  return result.rows.map((row) => ({
    fdcId: row.fdc_id,
    description: row.description,
  }));
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  console.log("=== Food State Assessment ===\n");
  console.log(`Version: ${ASSESSMENT_VERSION}\n`);

  const PARAMS_PER_ROW = 7;
  const BATCH_SIZE = 500;
  if (BATCH_SIZE * PARAMS_PER_ROW > 65535) {
    throw new Error(
      `Batch size ${BATCH_SIZE} x ${PARAMS_PER_ROW} params = ${BATCH_SIZE * PARAMS_PER_ROW} exceeds PostgreSQL limit of 65535`
    );
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    // Load foods
    console.log("Loading foods...");
    const foods = await loadFoods(client);
    console.log(`  Loaded ${foods.length} foods\n`);

    // Assess each food
    console.log("Assessing food states...");
    const states: FoodState[] = [];
    for (const food of foods) {
      states.push(assessFoodState(food.fdcId, food.description));
    }

    // Stats
    const cookingStateCounts: Record<string, number> = {};
    const preservationCounts: Record<string, number> = {};
    const processingCounts: Record<string, number> = {};
    const methodCounts: Record<string, number> = {};

    for (const s of states) {
      cookingStateCounts[s.cookingState] =
        (cookingStateCounts[s.cookingState] || 0) + 1;
      preservationCounts[s.preservation] =
        (preservationCounts[s.preservation] || 0) + 1;
      processingCounts[s.processing] =
        (processingCounts[s.processing] || 0) + 1;
      for (const m of s.cookingMethods) {
        methodCounts[m] = (methodCounts[m] || 0) + 1;
      }
    }

    console.log("\nCooking state distribution:");
    for (const [state, count] of Object.entries(cookingStateCounts).sort(
      (a, b) => b[1] - a[1]
    )) {
      const pct = ((count / states.length) * 100).toFixed(1);
      console.log(`  ${state}: ${count} (${pct}%)`);
    }

    console.log("\nPreservation distribution:");
    for (const [pres, count] of Object.entries(preservationCounts).sort(
      (a, b) => b[1] - a[1]
    )) {
      const pct = ((count / states.length) * 100).toFixed(1);
      console.log(`  ${pres}: ${count} (${pct}%)`);
    }

    console.log("\nProcessing distribution:");
    for (const [proc, count] of Object.entries(processingCounts).sort(
      (a, b) => b[1] - a[1]
    )) {
      const pct = ((count / states.length) * 100).toFixed(1);
      console.log(`  ${proc}: ${count} (${pct}%)`);
    }

    console.log("\nCooking method distribution:");
    for (const [method, count] of Object.entries(methodCounts).sort(
      (a, b) => b[1] - a[1]
    )) {
      console.log(`  ${method}: ${count}`);
    }

    // Write to database
    console.log("\nSaving to database...");

    await client.query("BEGIN");
    await client.query("DELETE FROM food_state");

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
          ASSESSMENT_VERSION
        );
        idx += PARAMS_PER_ROW;
      }

      await client.query(
        `INSERT INTO food_state
         (fdc_id, cooking_state, cooking_methods, preservation, processing, source_tokens, assessed_at, assessment_version)
         VALUES ${placeholders.join(", ")}
         ON CONFLICT (fdc_id)
         DO UPDATE SET
           cooking_state = EXCLUDED.cooking_state,
           cooking_methods = EXCLUDED.cooking_methods,
           preservation = EXCLUDED.preservation,
           processing = EXCLUDED.processing,
           source_tokens = EXCLUDED.source_tokens,
           assessed_at = EXCLUDED.assessed_at,
           assessment_version = EXCLUDED.assessment_version`,
        values
      );
    }

    await client.query("COMMIT");
    console.log("Done!\n");

    // Examples
    console.log("--- Examples: cooked with methods ---");
    const cookedExamples = states
      .filter((s) => s.cookingMethods.length > 0)
      .slice(0, 8);
    for (const s of cookedExamples) {
      const food = foods.find((f) => f.fdcId === s.fdcId)!;
      console.log(
        `  [${s.cookingMethods.join("+")}] ${food.description.substring(0, 60)}`
      );
      console.log(`    tokens: ${s.sourceTokens.join(", ")}`);
    }

    console.log("\n--- Examples: preserved ---");
    const preservedExamples = states
      .filter((s) => s.preservation !== "unknown")
      .slice(0, 8);
    for (const s of preservedExamples) {
      const food = foods.find((f) => f.fdcId === s.fdcId)!;
      console.log(
        `  [${s.preservation}] ${food.description.substring(0, 60)}`
      );
    }

    console.log("\n--- Examples: processed ---");
    const processedExamples = states
      .filter((s) => s.processing !== "unknown")
      .slice(0, 8);
    for (const s of processedExamples) {
      const food = foods.find((f) => f.fdcId === s.fdcId)!;
      console.log(
        `  [${s.processing}] ${food.description.substring(0, 60)}`
      );
    }

    console.log("\n--- Examples: unknown (no state keywords) ---");
    const unknownExamples = states
      .filter(
        (s) =>
          s.cookingState === "unknown" &&
          s.preservation === "unknown" &&
          s.processing === "unknown"
      )
      .slice(0, 8);
    for (const s of unknownExamples) {
      const food = foods.find((f) => f.fdcId === s.fdcId)!;
      console.log(`  ${food.description.substring(0, 70)}`);
    }
  } catch (error) {
    await client.query("ROLLBACK");
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
