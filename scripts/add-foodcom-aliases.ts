#!/usr/bin/env npx tsx
/**
 * Add aliases for high-frequency unmapped Food.com ingredients
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../src/lib/db";

interface Alias {
  canonical_slug: string;
  alias: string;
}

// Map Food.com ingredient variations to canonical slugs
const NEW_ALIASES: Alias[] = [
  // Sugar variations
  { canonical_slug: "powdered-sugar", alias: "confectioners' sugar" },
  { canonical_slug: "powdered-sugar", alias: "confectioners sugar" },
  { canonical_slug: "powdered-sugar", alias: "icing sugar" },
  { canonical_slug: "powdered-sugar", alias: "10x sugar" },
  
  // Chicken variations
  { canonical_slug: "chicken-thighs", alias: "boneless skinless chicken thighs" },
  { canonical_slug: "chicken-thighs", alias: "boneless chicken thighs" },
  
  // Bouillon/stock cubes
  { canonical_slug: "chicken-broth", alias: "chicken bouillon cubes" },
  { canonical_slug: "chicken-broth", alias: "chicken bouillon" },
  { canonical_slug: "beef-broth", alias: "beef bouillon granules" },
  { canonical_slug: "beef-broth", alias: "beef bouillon cubes" },
  { canonical_slug: "beef-broth", alias: "beef bouillon" },
  
  // Rice wine
  { canonical_slug: "rice-wine", alias: "rice wine" },
  { canonical_slug: "rice-wine", alias: "chinese rice wine" },
  { canonical_slug: "rice-vinegar", alias: "rice wine vinegar" },
  
  // Beef cuts
  { canonical_slug: "beef-chuck-roast", alias: "chuck roast" },
  { canonical_slug: "beef-chuck-roast", alias: "chuck beef roast" },
  
  // Pasta
  { canonical_slug: "lasagna-noodles", alias: "lasagna noodles" },
  { canonical_slug: "bow-tie-pasta", alias: "bow tie pasta" },
  { canonical_slug: "bow-tie-pasta", alias: "bowtie pasta" },
  { canonical_slug: "bow-tie-pasta", alias: "farfalle pasta" },
  
  // Shrimp
  { canonical_slug: "shrimp", alias: "large shrimp" },
  { canonical_slug: "shrimp", alias: "medium shrimp" },
  { canonical_slug: "shrimp", alias: "small shrimp" },
  { canonical_slug: "shrimp", alias: "jumbo shrimp" },
  
  // Cake mixes
  { canonical_slug: "yellow-cake-mix", alias: "yellow cake mix" },
  { canonical_slug: "chocolate-cake-mix", alias: "chocolate cake mix" },
  { canonical_slug: "white-cake-mix", alias: "white cake mix" },
  
  // Whipped topping
  { canonical_slug: "whipped-topping", alias: "cool whip" },
  { canonical_slug: "whipped-topping", alias: "coolwhip" },
  
  // Oats
  { canonical_slug: "quick-cooking-oats", alias: "quick-cooking rolled oats" },
  { canonical_slug: "quick-cooking-oats", alias: "quick cooking rolled oats" },
  
  // Seasonings
  { canonical_slug: "old-bay-seasoning", alias: "old bay seasoning" },
  { canonical_slug: "old-bay-seasoning", alias: "old bay" },
  { canonical_slug: "taco-seasoning", alias: "taco seasoning" },
  { canonical_slug: "taco-seasoning", alias: "taco seasoning mix" },
  
  // Turkey
  { canonical_slug: "turkey", alias: "whole turkey" },
  
  // Enchilada sauce
  { canonical_slug: "enchilada-sauce", alias: "enchilada sauce" },
  { canonical_slug: "enchilada-sauce", alias: "red enchilada sauce" },
  
  // Milk variations
  { canonical_slug: "low-fat-milk", alias: "1% low-fat milk" },
  { canonical_slug: "low-fat-milk", alias: "1% milk" },
  { canonical_slug: "low-fat-milk", alias: "2% milk" },
  { canonical_slug: "low-fat-milk", alias: "2% low-fat milk" },
  
  // Breadcrumbs
  { canonical_slug: "italian-breadcrumbs", alias: "italian seasoned breadcrumbs" },
  { canonical_slug: "italian-breadcrumbs", alias: "italian bread crumbs" },
  { canonical_slug: "breadcrumbs", alias: "fresh breadcrumb" },
  { canonical_slug: "breadcrumbs", alias: "fresh breadcrumbs" },
  
  // Guacamole
  { canonical_slug: "guacamole", alias: "guacamole" },
  
  // Liquid smoke
  { canonical_slug: "liquid-smoke", alias: "liquid smoke" },
  
  // Mustard
  { canonical_slug: "mustard", alias: "yellow mustard" },
  { canonical_slug: "mustard", alias: "prepared yellow mustard" },
  
  // Pork and beans
  { canonical_slug: "pork-and-beans", alias: "pork and beans" },
  
  // Zest
  { canonical_slug: "lime-zest", alias: "lime zest" },
  { canonical_slug: "lemon-zest", alias: "lemon zest" },
  { canonical_slug: "orange-zest", alias: "orange zest" },
  
  // Red pepper flakes
  { canonical_slug: "red-pepper-flakes", alias: "dried red pepper flakes" },
  { canonical_slug: "red-pepper-flakes", alias: "crushed red pepper" },
  { canonical_slug: "red-pepper-flakes", alias: "crushed red pepper flakes" },
  
  // Yeast
  { canonical_slug: "active-dry-yeast", alias: "instant yeast" },
  { canonical_slug: "active-dry-yeast", alias: "bread machine yeast" },
  
  // Cucumber
  { canonical_slug: "cucumber", alias: "english cucumber" },
  { canonical_slug: "cucumber", alias: "hothouse cucumber" },
  
  // Sauces
  { canonical_slug: "pizza-sauce", alias: "pizza sauce" },
  { canonical_slug: "marinara-sauce", alias: "pasta sauce" },
  { canonical_slug: "marinara-sauce", alias: "marinara sauce" },
  { canonical_slug: "teriyaki-sauce", alias: "teriyaki sauce" },
  
  // Green chilies
  { canonical_slug: "green-chilies", alias: "diced green chilies" },
  { canonical_slug: "green-chilies", alias: "canned green chilies" },
  
  // Crescent rolls
  { canonical_slug: "crescent-roll-dough", alias: "crescent roll dough" },
  { canonical_slug: "crescent-roll-dough", alias: "refrigerated crescent rolls" },
  
  // Peppercorns
  { canonical_slug: "black-peppercorns", alias: "peppercorns" },
  { canonical_slug: "black-peppercorns", alias: "whole peppercorns" },
  
  // Chocolate chips
  { canonical_slug: "semisweet-chocolate-chips", alias: "miniature semisweet chocolate chips" },
  { canonical_slug: "semisweet-chocolate-chips", alias: "mini chocolate chips" },
  
  // Onion soup mix
  { canonical_slug: "onion-soup-mix", alias: "onion soup mix" },
  { canonical_slug: "onion-soup-mix", alias: "dry onion soup mix" },
  { canonical_slug: "onion-soup-mix", alias: "lipton onion soup mix" },
  
  // Peanut butter cups
  { canonical_slug: "peanut-butter-cups", alias: "miniature peanut butter cups" },
  { canonical_slug: "peanut-butter-cups", alias: "reese's peanut butter cups" },
  
  // Bread flour
  { canonical_slug: "bread-flour", alias: "white bread flour" },
  
  // Artichoke hearts
  { canonical_slug: "artichoke-hearts", alias: "marinated artichoke hearts" },
  
  // Pizza dough
  { canonical_slug: "pizza-dough", alias: "pizza dough" },
  { canonical_slug: "pizza-dough", alias: "refrigerated pizza dough" },
  
  // Pork chops
  { canonical_slug: "pork-chops", alias: "pork loin chops" },
  { canonical_slug: "pork-chops", alias: "center cut pork chops" },
  
  // Ranch dressing mix
  { canonical_slug: "ranch-dressing-mix", alias: "hidden valley ranch dressing mix" },
  { canonical_slug: "ranch-dressing-mix", alias: "ranch dressing mix" },
  
  // Chocolate kisses
  { canonical_slug: "chocolate-kisses", alias: "hershey chocolate kisses" },
  { canonical_slug: "chocolate-kisses", alias: "hershey's kisses" },
  
  // Pudding mix
  { canonical_slug: "chocolate-pudding-mix", alias: "instant chocolate pudding mix" },
  { canonical_slug: "vanilla-pudding-mix", alias: "instant vanilla pudding mix" },
  
  // Texas toast
  { canonical_slug: "bread", alias: "texas toast thick bread" },
  { canonical_slug: "bread", alias: "texas toast" },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}\n`);
  
  // First verify all canonical slugs exist
  const canonicals = await db.query<{ canonical_slug: string }>(
    `SELECT canonical_slug FROM canonical_ingredient`
  );
  const validSlugs = new Set(canonicals.rows.map(r => r.canonical_slug));
  
  const missing: string[] = [];
  const valid: Alias[] = [];
  
  for (const alias of NEW_ALIASES) {
    if (!validSlugs.has(alias.canonical_slug)) {
      missing.push(alias.canonical_slug);
    } else {
      valid.push(alias);
    }
  }
  
  if (missing.length > 0) {
    console.log("Missing canonical slugs (need to create these first):");
    [...new Set(missing)].forEach(s => console.log(`  - ${s}`));
    console.log();
  }
  
  console.log(`Adding ${valid.length} aliases...`);
  
  // Build a map from slug -> canonical_id
  const slugToId = new Map<string, string>();
  const idRows = await db.query<{ canonical_id: string; canonical_slug: string }>(
    `SELECT canonical_id, canonical_slug FROM canonical_ingredient`
  );
  for (const row of idRows.rows) {
    slugToId.set(row.canonical_slug, row.canonical_id);
  }
  
  // Normalize function to match alias_norm format
  const normalizeAlias = (s: string) => s.toLowerCase().trim();
  
  if (dryRun) {
    for (const alias of valid) {
      console.log(`  ${alias.canonical_slug} <- "${alias.alias}"`);
    }
  } else {
    let added = 0;
    let skipped = 0;
    
    for (const alias of valid) {
      const canonicalId = slugToId.get(alias.canonical_slug);
      if (!canonicalId) {
        console.log(`  Skipped: ${alias.alias} (no canonical_id for ${alias.canonical_slug})`);
        skipped++;
        continue;
      }
      
      try {
        await db.query(
          `INSERT INTO canonical_ingredient_alias (canonical_id, alias_norm, alias_source)
           VALUES ($1, $2, 'foodcom')
           ON CONFLICT (canonical_id, alias_norm) DO NOTHING`,
          [canonicalId, normalizeAlias(alias.alias)]
        );
        added++;
      } catch (e) {
        console.log(`  Skipped: ${alias.alias} (may already exist)`);
        skipped++;
      }
    }
    
    console.log(`\nDone: ${added} added, ${skipped} skipped`);
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
