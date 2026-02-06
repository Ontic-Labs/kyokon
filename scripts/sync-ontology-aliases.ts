/**
 * Sync cleaned ontology surface forms to canonical_ingredient_alias table
 *
 * Usage:
 *   npx tsx scripts/sync-ontology-aliases.ts              # dry run
 *   npx tsx scripts/sync-ontology-aliases.ts --write      # write to DB
 */

import * as fs from "fs";
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

interface OntologyEntry {
  slug: string;
  displayName: string;
  surfaceForms: string[];
  fdcId?: number | null;
  recipeCount?: number;
}

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return new Pool({ connectionString, max: 1 });
}

async function main(): Promise<void> {
  const write = process.argv.includes("--write");

  console.log("=== Sync Ontology Aliases ===");
  console.log(`Mode: ${write ? "WRITE" : "DRY RUN"}\n`);

  // Load cleaned ontology
  const ontologyPath = "data/ingredient-ontology-cleaned.json";
  if (!fs.existsSync(ontologyPath)) {
    throw new Error(`${ontologyPath} not found. Run: npx tsx scripts/clean-ontology-synonyms.ts --write`);
  }
  const ontology: OntologyEntry[] = JSON.parse(fs.readFileSync(ontologyPath, "utf-8"));
  console.log(`Loaded ${ontology.length} ontology entries`);

  // Count total surface forms
  const totalForms = ontology.reduce((sum, e) => sum + e.surfaceForms.length, 0);
  console.log(`Total surface forms: ${totalForms}`);

  const pool = getPool();
  const client = await pool.connect();

  try {
    // Load canonical_ingredient slugs → canonical_id mapping
    const canonicalResult = await client.query<{
      canonical_id: string;
      canonical_slug: string;
    }>(`SELECT canonical_id, canonical_slug FROM canonical_ingredient`);

    const slugToId = new Map<string, string>();
    for (const r of canonicalResult.rows) {
      slugToId.set(r.canonical_slug, r.canonical_id);
    }
    console.log(`Found ${slugToId.size} canonical ingredients in database`);

    // Check current alias count
    const currentCount = await client.query<{ cnt: string }>(
      `SELECT COUNT(*) as cnt FROM canonical_ingredient_alias`
    );
    console.log(`Current alias count: ${currentCount.rows[0].cnt}`);

    // Build alias rows
    const aliasRows: Array<{
      canonical_id: string;
      alias_norm: string;
      alias_count: number;
    }> = [];

    let matchedEntries = 0;
    let unmatchedEntries = 0;
    const unmatchedSlugs: string[] = [];

    for (const entry of ontology) {
      const canonicalId = slugToId.get(entry.slug);
      if (!canonicalId) {
        unmatchedEntries++;
        if (unmatchedSlugs.length < 20) unmatchedSlugs.push(entry.slug);
        continue;
      }

      matchedEntries++;
      for (const sf of entry.surfaceForms) {
        const norm = sf.toLowerCase().trim();
        if (norm.length >= 2) {
          aliasRows.push({
            canonical_id: canonicalId,
            alias_norm: norm,
            alias_count: entry.recipeCount ?? 1,
          });
        }
      }
    }

    console.log(`\nMatched ${matchedEntries} entries to canonical_ingredient`);
    console.log(`Unmatched: ${unmatchedEntries} entries`);
    if (unmatchedSlugs.length > 0) {
      console.log(`Sample unmatched: ${unmatchedSlugs.slice(0, 10).join(", ")}...`);
    }
    console.log(`Alias rows to insert: ${aliasRows.length}`);

    if (!write) {
      console.log("\nDry run. Use --write to sync.");
      return;
    }

    // Write to database
    console.log("\nWriting to database...");
    await client.query("BEGIN");

    try {
      // Delete existing ontology aliases (keep other sources)
      const deleteResult = await client.query(
        `DELETE FROM canonical_ingredient_alias WHERE alias_source = 'ontology'`
      );
      console.log(`Deleted ${deleteResult.rowCount} existing ontology aliases`);

      // Insert in batches
      const BATCH_SIZE = 500;
      let inserted = 0;
      let skipped = 0;

      for (let i = 0; i < aliasRows.length; i += BATCH_SIZE) {
        const batch = aliasRows.slice(i, i + BATCH_SIZE);
        const values: unknown[] = [];
        const placeholders: string[] = [];

        for (let j = 0; j < batch.length; j++) {
          const row = batch[j];
          const offset = j * 4;
          placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
          values.push(row.canonical_id, row.alias_norm, row.alias_count, "ontology");
        }

        const result = await client.query(
          `INSERT INTO canonical_ingredient_alias (canonical_id, alias_norm, alias_count, alias_source)
           VALUES ${placeholders.join(", ")}
           ON CONFLICT (canonical_id, alias_norm) DO UPDATE SET
             alias_count = GREATEST(canonical_ingredient_alias.alias_count, EXCLUDED.alias_count),
             alias_source = CASE
               WHEN canonical_ingredient_alias.alias_source = 'ontology' THEN 'ontology'
               ELSE canonical_ingredient_alias.alias_source || ',ontology'
             END`,
          values
        );
        inserted += result.rowCount ?? 0;

        if ((i + BATCH_SIZE) % 1000 < BATCH_SIZE || i + BATCH_SIZE >= aliasRows.length) {
          console.log(`  ${Math.min(i + BATCH_SIZE, aliasRows.length)}/${aliasRows.length} processed`);
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    // Final count
    const finalCount = await client.query<{ cnt: string }>(
      `SELECT COUNT(*) as cnt FROM canonical_ingredient_alias`
    );
    const ontologyCount = await client.query<{ cnt: string }>(
      `SELECT COUNT(*) as cnt FROM canonical_ingredient_alias WHERE alias_source LIKE '%ontology%'`
    );

    console.log(`\nDone.`);
    console.log(`Total aliases: ${finalCount.rows[0].cnt}`);
    console.log(`Ontology aliases: ${ontologyCount.rows[0].cnt}`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
