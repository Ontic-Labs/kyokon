#!/usr/bin/env npx tsx
/**
 * Add missing canonical ingredients for Food.com mapping
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../src/lib/db";

interface Canonical {
  slug: string;
  name: string;
  category: string;
}

// Get next synthetic FDC ID
async function getNextSyntheticId(): Promise<number> {
  const result = await db.query<{ max: number }>(
    `SELECT COALESCE(MAX(synthetic_fdc_id), 9000000) as max FROM canonical_ingredient`
  );
  return result.rows[0].max + 1;
}

// Missing canonicals identified from Food.com analysis
const MISSING_CANONICALS: Canonical[] = [
  // Alcohol/Wine
  { slug: "rice-wine", name: "rice wine", category: "Beverages" },
  
  // Beef cuts
  { slug: "beef-chuck-roast", name: "beef chuck roast", category: "Beef Products" },
  
  // Pasta
  { slug: "lasagna-noodles", name: "lasagna noodles", category: "Cereal Grains and Pasta" },
  { slug: "bow-tie-pasta", name: "bow tie pasta", category: "Cereal Grains and Pasta" },
  
  // Cake mixes
  { slug: "yellow-cake-mix", name: "yellow cake mix", category: "Baked Products" },
  { slug: "chocolate-cake-mix", name: "chocolate cake mix", category: "Baked Products" },
  { slug: "white-cake-mix", name: "white cake mix", category: "Baked Products" },
  
  // Seasonings
  { slug: "old-bay-seasoning", name: "Old Bay seasoning", category: "Spices and Herbs" },
  { slug: "taco-seasoning", name: "taco seasoning", category: "Spices and Herbs" },
  
  // Poultry
  { slug: "turkey", name: "turkey", category: "Poultry Products" },
  
  // Sauces
  { slug: "enchilada-sauce", name: "enchilada sauce", category: "Soups, Sauces, and Gravies" },
  { slug: "pizza-sauce", name: "pizza sauce", category: "Soups, Sauces, and Gravies" },
  { slug: "marinara-sauce", name: "marinara sauce", category: "Soups, Sauces, and Gravies" },
  { slug: "teriyaki-sauce", name: "teriyaki sauce", category: "Soups, Sauces, and Gravies" },
  
  // Breadcrumbs
  { slug: "italian-breadcrumbs", name: "Italian seasoned breadcrumbs", category: "Baked Products" },
  
  // Prepared foods
  { slug: "guacamole", name: "guacamole", category: "Vegetables and Vegetable Products" },
  { slug: "pork-and-beans", name: "pork and beans", category: "Legumes and Legume Products" },
  
  // Flavorings
  { slug: "liquid-smoke", name: "liquid smoke", category: "Spices and Herbs" },
  
  // Citrus zest
  { slug: "lime-zest", name: "lime zest", category: "Fruits and Fruit Juices" },
  
  // Spices
  { slug: "black-peppercorns", name: "black peppercorns", category: "Spices and Herbs" },
  
  // Chocolate
  { slug: "semisweet-chocolate-chips", name: "semisweet chocolate chips", category: "Sweets" },
  { slug: "chocolate-kisses", name: "chocolate kisses", category: "Sweets" },
  
  // Mixes
  { slug: "onion-soup-mix", name: "onion soup mix", category: "Soups, Sauces, and Gravies" },
  { slug: "ranch-dressing-mix", name: "ranch dressing mix", category: "Fats and Oils" },
  { slug: "chocolate-pudding-mix", name: "chocolate pudding mix", category: "Sweets" },
  { slug: "vanilla-pudding-mix", name: "vanilla pudding mix", category: "Sweets" },
  
  // Dough
  { slug: "crescent-roll-dough", name: "crescent roll dough", category: "Baked Products" },
  { slug: "pizza-dough", name: "pizza dough", category: "Baked Products" },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}\n`);
  
  // Check which already exist
  const existing = await db.query<{ canonical_slug: string }>(
    `SELECT canonical_slug FROM canonical_ingredient`
  );
  const existingSlugs = new Set(existing.rows.map(r => r.canonical_slug));
  
  const toAdd = MISSING_CANONICALS.filter(c => !existingSlugs.has(c.slug));
  const alreadyExists = MISSING_CANONICALS.filter(c => existingSlugs.has(c.slug));
  
  if (alreadyExists.length > 0) {
    console.log(`Already exist (${alreadyExists.length}):`);
    alreadyExists.forEach(c => console.log(`  ✓ ${c.slug}`));
    console.log();
  }
  
  console.log(`To add (${toAdd.length}):`);
  
  if (dryRun) {
    toAdd.forEach(c => console.log(`  + ${c.slug} (${c.category})`));
  } else {
    let nextId = await getNextSyntheticId();
    
    for (const canonical of toAdd) {
      await db.query(
        `INSERT INTO canonical_ingredient 
         (canonical_slug, canonical_name, synthetic_fdc_id, canonical_rank, total_count)
         VALUES ($1, $2, $3, 0, 0)`,
        [canonical.slug, canonical.name, nextId++]
      );
      console.log(`  + ${canonical.slug} (id: ${nextId - 1})`);
    }
    
    console.log(`\nDone: ${toAdd.length} canonicals added`);
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
