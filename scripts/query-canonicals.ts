#!/usr/bin/env npx tsx
import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../src/lib/db";

async function main() {
  // Find sugar-related canonicals
  const sugars = await db.query(
    `SELECT canonical_slug, canonical_name FROM canonical_ingredient 
     WHERE canonical_name ILIKE '%sugar%' OR canonical_slug LIKE '%sugar%'`
  );
  console.log("=== Sugar Canonicals ===");
  sugars.rows.forEach(r => console.log(`  ${r.canonical_slug} -> ${r.canonical_name}`));

  // Find chicken-related
  const chicken = await db.query(
    `SELECT canonical_slug, canonical_name FROM canonical_ingredient 
     WHERE canonical_slug LIKE '%chicken%' LIMIT 20`
  );
  console.log("\n=== Chicken Canonicals ===");
  chicken.rows.forEach(r => console.log(`  ${r.canonical_slug} -> ${r.canonical_name}`));

  // Find shrimp
  const shrimp = await db.query(
    `SELECT canonical_slug, canonical_name FROM canonical_ingredient 
     WHERE canonical_slug LIKE '%shrimp%'`
  );
  console.log("\n=== Shrimp Canonicals ===");
  shrimp.rows.forEach(r => console.log(`  ${r.canonical_slug} -> ${r.canonical_name}`));

  // Find mustard
  const mustard = await db.query(
    `SELECT canonical_slug, canonical_name FROM canonical_ingredient 
     WHERE canonical_slug LIKE '%mustard%'`
  );
  console.log("\n=== Mustard Canonicals ===");
  mustard.rows.forEach(r => console.log(`  ${r.canonical_slug} -> ${r.canonical_name}`));

  // Find oats
  const oats = await db.query(
    `SELECT canonical_slug, canonical_name FROM canonical_ingredient 
     WHERE canonical_slug LIKE '%oat%'`
  );
  console.log("\n=== Oat Canonicals ===");
  oats.rows.forEach(r => console.log(`  ${r.canonical_slug} -> ${r.canonical_name}`));

  // Find existing aliases
  const aliases = await db.query(`SELECT COUNT(*) as cnt FROM canonical_ingredient_alias`);
  console.log(`\n=== Total Aliases: ${aliases.rows[0].cnt} ===`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
