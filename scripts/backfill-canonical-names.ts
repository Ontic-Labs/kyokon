/**
 * Canonical Names Backfill Script
 *
 * Computes base and specific canonical names for every food using the
 * deterministic canonicalizeDescription() function, then UPSERTs into
 * food_canonical_names.
 *
 * Usage:
 *   npx tsx scripts/backfill-canonical-names.ts
 *   npx tsx scripts/backfill-canonical-names.ts --force   # re-process all regardless of version
 */

import { Pool, PoolClient } from "pg";
import * as dotenv from "dotenv";
import * as crypto from "crypto";
import { canonicalizeDescription } from "../src/lib/canonicalize";

dotenv.config({ path: ".env.local" });

const CANONICAL_VERSION = "1.0.0";

// Each food produces 2 rows (base + specific), 8 params per row
const BATCH_SIZE = 500;
const PARAMS_PER_ROW = 8; // fdc_id, level, canonical_name, canonical_slug, removed_tokens, kept_tokens, description_hash, version
const ROWS_PER_FOOD = 2;

if (BATCH_SIZE * ROWS_PER_FOOD * PARAMS_PER_ROW > 65535) {
  throw new Error(
    `Batch size ${BATCH_SIZE} x ${ROWS_PER_FOOD} rows x ${PARAMS_PER_ROW} params = ${BATCH_SIZE * ROWS_PER_FOOD * PARAMS_PER_ROW} exceeds PostgreSQL limit of 65535`
  );
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
  client: PoolClient,
  forceMode: boolean
): Promise<Array<{ fdcId: number; description: string }>> {
  // In incremental mode, skip foods where description_hash + version already match
  const sql = forceMode
    ? `SELECT fdc_id, description FROM foods ORDER BY fdc_id`
    : `SELECT f.fdc_id, f.description
       FROM foods f
       WHERE NOT EXISTS (
         SELECT 1 FROM food_canonical_names cn
         WHERE cn.fdc_id = f.fdc_id
           AND cn.level = 'base'
           AND cn.description_hash = md5(f.description)
           AND cn.canonical_version = '${CANONICAL_VERSION}'
       )
       ORDER BY f.fdc_id`;

  const result = await client.query<{
    fdc_id: number;
    description: string;
  }>(sql);

  return result.rows.map((row) => ({
    fdcId: Number(row.fdc_id),
    description: row.description,
  }));
}

// ============================================
// Main
// ============================================

interface CanonicalRow {
  fdcId: number;
  level: "base" | "specific";
  canonicalName: string;
  canonicalSlug: string;
  removedTokens: string[];
  keptTokens: string[];
  descriptionHash: string;
}

async function main(): Promise<void> {
  console.log("=== Canonical Names Backfill ===\n");
  console.log(`Version: ${CANONICAL_VERSION}`);

  const forceMode = process.argv.includes("--force");
  if (forceMode) console.log("Force mode: re-processing all foods");
  console.log();

  const pool = getPool();
  const client = await pool.connect();

  try {
    // Load foods
    console.log("Loading foods...");
    const foods = await loadFoods(client, forceMode);
    console.log(`  Loaded ${foods.length} foods\n`);

    // Compute canonical names
    console.log("Computing canonical names...");
    const rows: CanonicalRow[] = [];
    const baseNames = new Map<string, number>();
    const specificNames = new Map<string, number>();
    let specificDiffers = 0;

    for (const food of foods) {
      const result = canonicalizeDescription(food.description);
      const hash = crypto
        .createHash("md5")
        .update(food.description)
        .digest("hex");

      rows.push({
        fdcId: food.fdcId,
        level: "base",
        canonicalName: result.baseName,
        canonicalSlug: result.baseSlug,
        removedTokens: result.removedTokens,
        keptTokens: result.keptTokens,
        descriptionHash: hash,
      });

      rows.push({
        fdcId: food.fdcId,
        level: "specific",
        canonicalName: result.specificName,
        canonicalSlug: result.specificSlug,
        removedTokens: result.removedTokens,
        keptTokens: result.keptTokens,
        descriptionHash: hash,
      });

      baseNames.set(
        result.baseSlug,
        (baseNames.get(result.baseSlug) || 0) + 1
      );
      specificNames.set(
        result.specificSlug,
        (specificNames.get(result.specificSlug) || 0) + 1
      );

      if (result.specificName !== result.baseName) {
        specificDiffers++;
      }
    }

    // Stats
    console.log(`\n  Total foods: ${foods.length}`);
    console.log(`  Unique base names: ${baseNames.size}`);
    console.log(`  Unique specific names: ${specificNames.size}`);
    console.log(
      `  Foods where specific != base: ${specificDiffers} (${((specificDiffers / foods.length) * 100).toFixed(1)}%)\n`
    );

    console.log("Top 20 base canonical names:");
    const sortedBases = [...baseNames.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    for (const [slug, count] of sortedBases) {
      console.log(`  ${slug}: ${count}`);
    }

    console.log("\nExamples where specific differs from base:");
    let exampleCount = 0;
    for (const food of foods) {
      if (exampleCount >= 10) break;
      const result = canonicalizeDescription(food.description);
      if (result.specificName !== result.baseName) {
        console.log(
          `  "${food.description.substring(0, 60)}" → base="${result.baseName}", specific="${result.specificName}"`
        );
        exampleCount++;
      }
    }

    // Write to database
    console.log("\nSaving to database...");

    // Process in batches of BATCH_SIZE foods (= BATCH_SIZE * 2 rows)
    for (let i = 0; i < rows.length; i += BATCH_SIZE * ROWS_PER_FOOD) {
      const batch = rows.slice(i, i + BATCH_SIZE * ROWS_PER_FOOD);
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let idx = 1;

      for (const row of batch) {
        placeholders.push(
          `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7})`
        );
        values.push(
          row.fdcId,
          row.level,
          row.canonicalName,
          row.canonicalSlug,
          row.removedTokens,
          row.keptTokens,
          row.descriptionHash,
          CANONICAL_VERSION
        );
        idx += PARAMS_PER_ROW;
      }

      await client.query("BEGIN");
      await client.query(
        `INSERT INTO food_canonical_names
         (fdc_id, level, canonical_name, canonical_slug, removed_tokens, kept_tokens, description_hash, canonical_version)
         VALUES ${placeholders.join(", ")}
         ON CONFLICT (fdc_id, level)
         DO UPDATE SET
           canonical_name = EXCLUDED.canonical_name,
           canonical_slug = EXCLUDED.canonical_slug,
           removed_tokens = EXCLUDED.removed_tokens,
           kept_tokens = EXCLUDED.kept_tokens,
           description_hash = EXCLUDED.description_hash,
           canonical_version = EXCLUDED.canonical_version,
           assessed_at = NOW()`,
        values
      );
      await client.query("COMMIT");

      const batchNum = Math.floor(i / (BATCH_SIZE * ROWS_PER_FOOD)) + 1;
      const totalBatches = Math.ceil(
        rows.length / (BATCH_SIZE * ROWS_PER_FOOD)
      );
      console.log(`  Batch ${batchNum}/${totalBatches} (${batch.length} rows)`);
    }

    console.log("\nDone!\n");

    // Verify
    const verifyResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM food_canonical_names`
    );
    console.log(
      `Verification: ${verifyResult.rows[0].count} rows in food_canonical_names (expected ${foods.length * 2})`
    );
  } catch (error) {
    // Each batch commits independently, so prior batches are already persisted.
    // UPSERTs are idempotent — safe to re-run after a partial failure.
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
