/**
 * Build synonym clusters from recipe ingredient corpus
 *
 * Approach:
 * 1. Load all ingredient frequencies from RAW_recipes.csv
 * 2. Filter to actual ingredients (exclude instructions like "add garlic")
 * 3. Tokenize and extract base terms
 * 4. Cluster by shared base + form modifiers (powder, fresh, dried, etc.)
 * 5. Output clusters with canonical (highest frequency) and aliases
 *
 * Usage:
 *   npx tsx scripts/build-synonym-clusters.ts
 *   npx tsx scripts/build-synonym-clusters.ts --min-freq 10
 */

import * as fs from "fs";
import { parse } from "csv-parse";

// ---------------------------------------------------------------------------
// Instruction verbs - these indicate recipe steps, not ingredients
// ---------------------------------------------------------------------------
const INSTRUCTION_VERBS = new Set([
  "add", "stir", "mix", "combine", "pour", "place", "put", "set", "remove",
  "discard", "drain", "rinse", "wash", "chop", "dice", "mince", "slice",
  "cut", "peel", "core", "seed", "trim", "cook", "bake", "fry", "saute",
  "sauté", "boil", "simmer", "roast", "grill", "broil", "steam", "blend",
  "whisk", "beat", "fold", "knead", "roll", "spread", "sprinkle", "season",
  "taste", "serve", "garnish", "top", "cover", "wrap", "refrigerate", "freeze",
  "thaw", "heat", "warm", "cool", "chill", "let", "allow", "wait", "rest",
  "transfer", "scrape", "toss", "coat", "dip", "dredge", "bread", "stuff",
  "fill", "layer", "arrange", "flip", "turn", "reduce", "deglaze", "reserve",
]);

// ---------------------------------------------------------------------------
// Form modifiers - these differentiate variants of the same base ingredient
// ---------------------------------------------------------------------------
const FORM_MODIFIERS = new Set([
  // Processing state
  "powder", "powdered", "ground", "granulated", "granules", "flakes", "flaked",
  "minced", "chopped", "diced", "sliced", "shredded", "grated", "crushed",
  "whole", "halved", "quartered", "cubed",
  // Preservation
  "fresh", "dried", "dry", "frozen", "canned", "pickled", "smoked", "cured",
  "roasted", "toasted",
  // Preparation
  "raw", "cooked", "uncooked", "blanched", "peeled", "seeded", "pitted",
  "boneless", "skinless",
  // Size
  "large", "medium", "small", "baby", "mini", "jumbo",
  // Quality
  "organic", "natural", "pure", "real", "imitation",
]);

// ---------------------------------------------------------------------------
// Base ingredient extractors
// ---------------------------------------------------------------------------

// Lemma mappings for normalizing forms
const LEMMAS = new Map<string, string>([
  ["powdered", "powder"],
  ["granulated", "granules"],
  ["flaked", "flakes"],
  ["dried", "dry"],
  ["roasted", "roast"],
  ["toasted", "toast"],
  ["smoked", "smoke"],
  ["minced", "mince"],
  ["chopped", "chop"],
  ["diced", "dice"],
  ["sliced", "slice"],
  ["shredded", "shred"],
  ["grated", "grate"],
  ["crushed", "crush"],
  ["peeled", "peel"],
  ["seeded", "seed"],
  ["pitted", "pit"],
  ["halved", "half"],
  ["quartered", "quarter"],
  ["cubed", "cube"],
  ["cloves", "clove"],
  ["heads", "head"],
  ["bulbs", "bulb"],
  ["stalks", "stalk"],
  ["leaves", "leaf"],
  ["sprigs", "sprig"],
  ["bunches", "bunch"],
]);

function lemmatize(word: string): string {
  return LEMMAS.get(word) || word;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(t => t.length >= 2);
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function isInstruction(ingredient: string): boolean {
  const tokens = tokenize(ingredient);
  // If first token is an instruction verb, it's likely a recipe step
  if (tokens.length > 0 && INSTRUCTION_VERBS.has(tokens[0])) {
    return true;
  }
  // Check for common instruction patterns
  if (/^(add|stir|mix|pour|place|remove|discard)\s/i.test(ingredient)) {
    return true;
  }
  // Check for time/quantity patterns that indicate instructions
  if (/\d+\s*(minute|second|hour|cup|tablespoon|teaspoon|pound|ounce)/i.test(ingredient)) {
    return true;
  }
  return false;
}

function isCompoundProduct(ingredient: string): boolean {
  // Products like "chili-garlic sauce", "garlic bread" - keep these as separate entries
  // They're valid ingredients but shouldn't be clustered with the base
  const compoundIndicators = [
    "sauce", "bread", "croutons", "seasoning", "mix", "soup", "dressing",
    "cheese", "butter", "oil", "paste", "spread", "marinade", "rub",
  ];
  const tokens = tokenize(ingredient);
  // If it has a base ingredient + a product type, it's compound
  return compoundIndicators.some(ind => tokens.includes(ind)) && tokens.length >= 2;
}

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------

interface IngredientInfo {
  raw: string;
  tokens: string[];
  baseTokens: string[];  // tokens without form modifiers
  formTokens: string[];  // form modifier tokens
  count: number;
}

interface SynonymCluster {
  canonical: string;
  canonicalCount: number;
  baseKey: string;
  formKey: string;
  aliases: { name: string; count: number }[];
  totalCount: number;
}

function extractIngredientInfo(raw: string, count: number): IngredientInfo {
  const tokens = tokenize(raw);
  const baseTokens: string[] = [];
  const formTokens: string[] = [];

  for (const t of tokens) {
    const lemma = lemmatize(t);
    if (FORM_MODIFIERS.has(t) || FORM_MODIFIERS.has(lemma)) {
      formTokens.push(lemma);
    } else {
      baseTokens.push(t);
    }
  }

  return { raw, tokens, baseTokens, formTokens, count };
}

function makeClusterKey(info: IngredientInfo): string {
  // Key = sorted base tokens + sorted form tokens
  const base = [...info.baseTokens].sort().join("+");
  const form = [...info.formTokens].sort().join("+");
  return `${base}|${form}`;
}

function makeBaseKey(info: IngredientInfo): string {
  return [...info.baseTokens].sort().join("+");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function loadIngredients(): Promise<Map<string, number>> {
  const freq = new Map<string, number>();
  let lineNum = 0;

  return new Promise((resolve, reject) => {
    const parser = parse({
      columns: true,
      relax_quotes: true,
      relax_column_count: true,
      trim: false,
    });

    parser.on("readable", () => {
      let record: Record<string, string> | null;
      // eslint-disable-next-line no-cond-assign
      while ((record = parser.read())) {
        lineNum++;
        const rawList = record.ingredients;
        if (!rawList) {
          continue;
        }
        try {
          const jsonStr = rawList.replace(/'/g, '"');
          const ingredients: string[] = JSON.parse(jsonStr);
          for (const ing of ingredients) {
            const norm = ing.toLowerCase().trim();
            if (norm.length > 1) {
              freq.set(norm, (freq.get(norm) || 0) + 1);
            }
          }
        } catch {
          // skip malformed
        }

        if (lineNum % 50000 === 0) {
          process.stderr.write(`\r  Loading: ${lineNum} lines, ${freq.size} unique`);
        }
      }
    });

    parser.on("error", (err) => reject(err));
    parser.on("end", () => {
      process.stderr.write(`\r  Loaded: ${lineNum} lines, ${freq.size} unique ingredients\n`);
      resolve(freq);
    });

    fs.createReadStream("data/RAW_recipes.csv").pipe(parser);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const minFreqIdx = args.indexOf("--min-freq");
  const minFreq = minFreqIdx >= 0 ? parseInt(args[minFreqIdx + 1] || "5") : 5;

  console.log("=== Build Synonym Clusters ===\n");
  console.log(`Minimum frequency: ${minFreq}`);

  // Load ingredients
  const freq = await loadIngredients();

  // Filter and process
  console.log("\nFiltering and clustering...");
  const ingredients: IngredientInfo[] = [];
  let filtered = { instructions: 0, lowFreq: 0, kept: 0 };

  for (const [raw, count] of freq) {
    if (count < minFreq) {
      filtered.lowFreq++;
      continue;
    }
    if (isInstruction(raw)) {
      filtered.instructions++;
      continue;
    }
    ingredients.push(extractIngredientInfo(raw, count));
    filtered.kept++;
  }

  console.log(`  Instructions filtered: ${filtered.instructions}`);
  console.log(`  Low frequency filtered: ${filtered.lowFreq}`);
  console.log(`  Kept: ${filtered.kept}`);

  // Group by cluster key
  const clusters = new Map<string, IngredientInfo[]>();
  for (const info of ingredients) {
    const key = makeClusterKey(info);
    const existing = clusters.get(key) || [];
    existing.push(info);
    clusters.set(key, existing);
  }

  // Build synonym clusters (only clusters with 2+ members OR high frequency singles)
  const synonymClusters: SynonymCluster[] = [];
  for (const [key, members] of clusters) {
    // Sort by count descending
    members.sort((a, b) => b.count - a.count);
    const canonical = members[0];
    const totalCount = members.reduce((sum, m) => sum + m.count, 0);

    // Skip single-member clusters unless high frequency
    if (members.length === 1 && canonical.count < 100) {
      continue;
    }

    // Separate compound products into their own clusters
    const pureIngredients = members.filter(m => !isCompoundProduct(m.raw));
    const compounds = members.filter(m => isCompoundProduct(m.raw));

    if (pureIngredients.length > 0) {
      pureIngredients.sort((a, b) => b.count - a.count);
      const pureCanonical = pureIngredients[0];
      synonymClusters.push({
        canonical: pureCanonical.raw,
        canonicalCount: pureCanonical.count,
        baseKey: makeBaseKey(pureCanonical),
        formKey: pureCanonical.formTokens.sort().join("+") || "base",
        aliases: pureIngredients.slice(1).map(m => ({ name: m.raw, count: m.count })),
        totalCount: pureIngredients.reduce((s, m) => s + m.count, 0),
      });
    }

    // Compound products get their own entries (not clustered with base)
    for (const compound of compounds) {
      if (compound.count >= 50) {
        synonymClusters.push({
          canonical: compound.raw,
          canonicalCount: compound.count,
          baseKey: makeBaseKey(compound),
          formKey: "compound",
          aliases: [],
          totalCount: compound.count,
        });
      }
    }
  }

  // Sort by total count
  synonymClusters.sort((a, b) => b.totalCount - a.totalCount);

  console.log(`\nSynonym clusters: ${synonymClusters.length}`);

  // Group clusters by base ingredient for output
  const baseGroups = new Map<string, SynonymCluster[]>();
  for (const cluster of synonymClusters) {
    const existing = baseGroups.get(cluster.baseKey) || [];
    existing.push(cluster);
    baseGroups.set(cluster.baseKey, existing);
  }

  // Build output format
  const output = {
    generated: new Date().toISOString(),
    minFrequency: minFreq,
    stats: {
      totalClusters: synonymClusters.length,
      baseIngredients: baseGroups.size,
      withAliases: synonymClusters.filter(c => c.aliases.length > 0).length,
    },
    clusters: synonymClusters.slice(0, 2000).map(c => ({
      canonical: c.canonical,
      count: c.canonicalCount,
      form: c.formKey,
      aliases: c.aliases.length > 0 ? c.aliases : undefined,
      totalUsage: c.totalCount,
    })),
  };

  const outPath = "data/synonym-clusters.json";
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nWritten to ${outPath}`);

  // Show sample
  console.log("\n=== TOP 30 CLUSTERS ===\n");
  for (const cluster of synonymClusters.slice(0, 30)) {
    const aliasStr = cluster.aliases.length > 0
      ? ` + ${cluster.aliases.length} aliases`
      : "";
    console.log(`[${cluster.totalCount.toString().padStart(6)}] ${cluster.canonical} (${cluster.formKey})${aliasStr}`);
    for (const alias of cluster.aliases.slice(0, 3)) {
      console.log(`           └─ [${alias.count}] ${alias.name}`);
    }
    if (cluster.aliases.length > 3) {
      console.log(`           └─ ... and ${cluster.aliases.length - 3} more`);
    }
  }

  // Show a specific base ingredient example
  console.log("\n=== EXAMPLE: GARLIC CLUSTERS ===\n");
  const garlicClusters = synonymClusters.filter(c => c.baseKey.includes("garlic"));
  for (const cluster of garlicClusters.slice(0, 10)) {
    console.log(`[${cluster.totalCount.toString().padStart(6)}] ${cluster.canonical} (${cluster.formKey})`);
    for (const alias of cluster.aliases.slice(0, 5)) {
      console.log(`           └─ [${alias.count}] ${alias.name}`);
    }
  }
}

main().catch(console.error);
