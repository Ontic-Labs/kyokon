/**
 * Extract ingredient surface form variations from RAW_recipes.csv
 *
 * Groups ingredients by base term to find synonym clusters.
 *
 * Usage:
 *   npx tsx scripts/extract-ingredient-variants.ts garlic
 *   npx tsx scripts/extract-ingredient-variants.ts --all
 */

import * as fs from "fs";
import * as readline from "readline";

function parseIngredients(raw: string): string[] {
  try {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("[")) return [];
    const jsonStr = trimmed.replace(/'/g, '"');
    return JSON.parse(jsonStr);
  } catch {
    return [];
  }
}

async function extractAllIngredients(): Promise<Map<string, number>> {
  const fileStream = fs.createReadStream("data/RAW_recipes.csv");
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const freq = new Map<string, number>();
  let lineNum = 0;

  for await (const line of rl) {
    lineNum++;
    if (lineNum === 1) continue;

    // Find ingredients column - it's a bracketed list near end of line
    const bracketMatch = line.match(/\[('[^']*'(?:,\s*'[^']*')*)\]/g);
    if (bracketMatch) {
      // Last bracketed list that looks like ingredients (has quotes)
      for (const match of bracketMatch) {
        if (match.includes("'") && !match.includes("http")) {
          const ingredients = parseIngredients(match);
          for (const ing of ingredients) {
            const norm = ing.toLowerCase().trim();
            if (norm.length > 1) {
              freq.set(norm, (freq.get(norm) || 0) + 1);
            }
          }
        }
      }
    }

    if (lineNum % 50000 === 0) {
      process.stderr.write(`\r  ${lineNum} lines processed, ${freq.size} unique ingredients`);
    }
  }
  process.stderr.write(`\r  ${lineNum} lines processed, ${freq.size} unique ingredients\n`);

  return freq;
}

function findVariants(freq: Map<string, number>, searchTerm: string): [string, number][] {
  const variants: [string, number][] = [];
  const search = searchTerm.toLowerCase();

  for (const [ing, count] of freq) {
    if (ing.includes(search)) {
      variants.push([ing, count]);
    }
  }

  variants.sort((a, b) => b[1] - a[1]);
  return variants;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage:");
    console.log("  npx tsx scripts/extract-ingredient-variants.ts garlic");
    console.log("  npx tsx scripts/extract-ingredient-variants.ts --top 100");
    console.log("  npx tsx scripts/extract-ingredient-variants.ts --all");
    process.exit(0);
  }

  console.log("Extracting ingredients from RAW_recipes.csv...");
  const freq = await extractAllIngredients();

  if (args[0] === "--all") {
    // Output all ingredients sorted by frequency
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
    const output = {
      generated: new Date().toISOString(),
      totalUnique: sorted.length,
      ingredients: sorted.map(([name, count]) => ({ name, count }))
    };
    fs.writeFileSync("data/recipe-ingredient-frequencies.json", JSON.stringify(output, null, 2));
    console.log(`Written ${sorted.length} ingredients to data/recipe-ingredient-frequencies.json`);

  } else if (args[0] === "--top") {
    const n = parseInt(args[1] || "100");
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
    console.log(`\n=== TOP ${n} INGREDIENTS ===\n`);
    for (const [ing, count] of sorted) {
      console.log(`  [${count.toString().padStart(6)}] ${ing}`);
    }

  } else {
    // Search for variants of a term
    const searchTerm = args.join(" ");
    const variants = findVariants(freq, searchTerm);

    console.log(`\n=== "${searchTerm.toUpperCase()}" VARIATIONS ===`);
    console.log(`Total unique forms: ${variants.length}\n`);

    for (const [ing, count] of variants.slice(0, 100)) {
      console.log(`  [${count.toString().padStart(6)}] ${ing}`);
    }
    if (variants.length > 100) {
      console.log(`  ... and ${variants.length - 100} more`);
    }
  }
}

main().catch(console.error);
