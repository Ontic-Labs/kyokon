/**
 * Clean ontology surface forms for API alias table
 *
 * Removes problematic synonyms that would cause false matches:
 * 1. Generic single words (juice, sauce, bread, etc.)
 * 2. Stop words (with, from, and, etc.)
 * 3. Duplicates (same form → multiple slugs)
 *
 * Usage:
 *   npx tsx scripts/clean-ontology-synonyms.ts              # analyze only
 *   npx tsx scripts/clean-ontology-synonyms.ts --write      # write cleaned version
 */

import * as fs from "fs";

interface OntologyEntry {
  slug: string;
  displayName: string;
  surfaceForms: string[];
  fdcId?: number | null;
  fdcCandidate?: {
    description: string;
    category: string | null;
    matchScore: number;
  } | null;
  confirmTokens?: string[][];
  recipeCount?: number;
}

// Generic single words that are too ambiguous when alone
const GENERIC_SINGLE_WORDS = new Set([
  // Liquids
  "juice", "sauce", "broth", "stock", "wine", "beer", "water", "milk", "cream",
  "syrup", "vinegar", "oil",
  // Staples (some moved to ALLOWED_SINGLE_WORDS)
  "bread", "rice", "pasta", "cheese", "egg",
  "eggs", "meat", "fish", "fruit",
  // Descriptors that got split incorrectly
  "spices", "powder", "seed", "seeds", "dried", "fresh", "raw", "cooked",
  "ground", "whole", "chopped", "sliced", "diced", "minced", "active", "dry",
  // Common modifiers
  "white", "black", "red", "green", "yellow", "brown", "dark", "light",
  "hot", "cold", "warm", "sweet", "sour", "salty", "spicy",
  // Sizes/amounts
  "large", "small", "medium", "thin", "thick", "fine", "coarse",
  // Stop words
  "with", "from", "and", "the", "for", "per", "added", "vitamin",
  "concentrate", "shelf", "stable", "fortified", "enriched",
  // Generic food terms
  "bean", "beans", "pepper", "peppers", "tomato", "tomatoes", "onion", "onions",
  "mushroom", "mushrooms", "nut", "nuts", "herb", "herbs",
]);

// Words that are OK as single-word synonyms (specific enough)
const ALLOWED_SINGLE_WORDS = new Set([
  // Unique ingredients with no ambiguity
  "aioli", "amaretto", "anchovies", "anchovy", "arugula", "avocado",
  "bacon", "basil", "bourbon", "brandy", "brisket", "buttermilk",
  "capers", "cardamom", "caviar", "celery", "chervil", "chives",
  "cilantro", "cinnamon", "cloves", "cocoa", "cognac", "coriander",
  "cornstarch", "couscous", "cumin", "curry",
  "dill", "edamame", "eggplant", "endive", "escarole",
  "fennel", "fenugreek", "feta", "figs",
  "galangal", "garam", "ghee", "ginger", "gnocchi", "gouda", "grits", "guava",
  "halibut", "harissa", "hazelnuts", "horseradish", "hummus",
  "jalapeno", "jicama", "juniper",
  "kale", "kahlua", "kimchi", "kirsch", "kohlrabi", "kombu",
  "lavender", "leeks", "lemongrass", "lentils", "limoncello",
  "macadamia", "mango", "marjoram", "marsala", "mascarpone", "matcha",
  "mayonnaise", "mirin", "miso", "molasses", "mortadella", "mozzarella",
  "naan", "nutmeg",
  "okra", "olives", "oregano", "orzo",
  "pancetta", "panko", "papaya", "paprika", "parmesan", "parsley", "parsnip",
  "pecans", "pesto", "pistachios", "polenta", "pomegranate", "pork",
  "prosciutto", "provolone", "prunes",
  "quinoa",
  "radicchio", "radish", "raisins", "ricotta", "risotto", "rosemary", "rum",
  "saffron", "sage", "sake", "salami", "salmon", "sardines", "scallions",
  "scallops", "sesame", "shallot", "shallots", "sherry", "shrimp", "sriracha",
  "sumac", "sunchokes",
  "tahini", "tamarind", "tapioca", "tarragon", "tempeh", "thyme", "tofu",
  "truffle", "turmeric", "turnip",
  "vanilla", "vermouth", "vodka",
  "walnuts", "wasabi", "watercress", "whiskey", "worcestershire",
  "yeast", "yogurt",
  "zucchini",
  // Allspice is specific enough
  "allspice",
  // Allow these generic staples when they're legitimate single-word lookups
  "flour", "butter", "sugar", "salt", "honey", "vinegar",
]);

function normalizeForm(form: string): string {
  return form.toLowerCase().trim();
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isValidSynonym(
  form: string,
  slug: string,
  formToSlugs: Map<string, string[]>,
): { valid: boolean; reason?: string } {
  const norm = normalizeForm(form);
  const words = norm.split(/\s+/).filter(w => w.length > 0);

  // Empty or too short
  if (norm.length < 2) {
    return { valid: false, reason: "too_short" };
  }

  // Check for duplicates first (applies to both single and multi-word)
  const slugs = formToSlugs.get(norm) || [];
  if (slugs.length > 1) {
    // Only keep if it's an exact match to the slug
    const formSlug = slugify(norm);
    if (formSlug === slug) {
      return { valid: true };
    }
    // For single words, also check if slug is just the word
    if (words.length === 1 && slug === words[0]) {
      return { valid: true };
    }
    return { valid: false, reason: "duplicate_not_primary" };
  }

  // Single word checks
  if (words.length === 1) {
    const word = words[0];

    // Check if it's in the allowed list
    if (ALLOWED_SINGLE_WORDS.has(word)) {
      return { valid: true };
    }

    // Check if it's a generic word - but allow if slug exactly matches
    if (GENERIC_SINGLE_WORDS.has(word)) {
      if (slug === word || slug === word + "s" || slug + "s" === word) {
        return { valid: true }; // Keep "beer" for beer, "eggs" for egg, etc.
      }
      return { valid: false, reason: "generic_single_word" };
    }

    // Single word not in either list - allow if it matches slug or is unique
    const formSlug = slugify(norm);
    if (formSlug === slug || slug === formSlug) {
      return { valid: true };
    }

    // Unknown single word - allow if unique (already checked duplicates above)
    return { valid: true };
  }

  // Multi-word: already passed duplicate check, so it's valid
  return { valid: true };
}

function main() {
  const write = process.argv.includes("--write");

  console.log("=== Ontology Synonym Cleanup ===\n");

  // Load ontology
  const ontology: OntologyEntry[] = JSON.parse(
    fs.readFileSync("data/ingredient-ontology.json", "utf-8")
  );

  // Build form → slugs index for duplicate detection
  const formToSlugs = new Map<string, string[]>();
  for (const entry of ontology) {
    for (const sf of entry.surfaceForms) {
      const norm = normalizeForm(sf);
      const existing = formToSlugs.get(norm) || [];
      existing.push(entry.slug);
      formToSlugs.set(norm, existing);
    }
  }

  // Statistics
  let totalBefore = 0;
  let totalAfter = 0;
  const removedByReason: Record<string, number> = {};
  const removedExamples: Record<string, Array<{ slug: string; form: string }>> = {};

  // Clean each entry
  const cleaned: OntologyEntry[] = [];
  for (const entry of ontology) {
    const validForms: string[] = [];
    const seenNorm = new Set<string>();

    for (const sf of entry.surfaceForms) {
      totalBefore++;
      const { valid, reason } = isValidSynonym(sf, entry.slug, formToSlugs);

      if (valid) {
        const norm = normalizeForm(sf);
        if (!seenNorm.has(norm)) {
          validForms.push(sf);
          seenNorm.add(norm);
          totalAfter++;
        }
      } else {
        removedByReason[reason!] = (removedByReason[reason!] || 0) + 1;
        if (!removedExamples[reason!]) removedExamples[reason!] = [];
        if (removedExamples[reason!].length < 10) {
          removedExamples[reason!].push({ slug: entry.slug, form: sf });
        }
      }
    }

    // Always ensure displayName is included if it's valid and unique
    const displayNorm = normalizeForm(entry.displayName);
    if (!seenNorm.has(displayNorm)) {
      const displayFormSlug = slugify(displayNorm);
      // Add displayName only if it exactly matches this entry's slug
      // This prevents duplicates like "green beans" appearing for both green-beans and frozen-green-beans
      if (displayFormSlug === entry.slug) {
        const displayCheck = isValidSynonym(entry.displayName, entry.slug, formToSlugs);
        if (displayCheck.valid) {
          validForms.unshift(entry.displayName); // Add at front
          seenNorm.add(displayNorm);
        }
      }
      // If displayName doesn't match but entry has no forms, use slug as fallback
      else if (validForms.length === 0) {
        const slugName = entry.slug.replace(/-/g, " ");
        const slugCheck = isValidSynonym(slugName, entry.slug, formToSlugs);
        if (slugCheck.valid) {
          const slugNorm = normalizeForm(slugName);
          if (!seenNorm.has(slugNorm)) {
            validForms.push(slugName);
            seenNorm.add(slugNorm);
          }
        }
      }
    }

    cleaned.push({
      ...entry,
      surfaceForms: validForms,
    });
  }

  // Report
  console.log("Before cleanup:");
  console.log(`  ${ontology.length} entries`);
  console.log(`  ${totalBefore} surface forms`);
  console.log(`  ${formToSlugs.size} unique forms`);
  console.log(`  ${[...formToSlugs.values()].filter(s => s.length > 1).length} duplicate forms`);
  console.log();

  console.log("After cleanup:");
  console.log(`  ${cleaned.length} entries`);
  console.log(`  ${totalAfter} surface forms`);
  console.log(`  ${totalBefore - totalAfter} removed (${((totalBefore - totalAfter) / totalBefore * 100).toFixed(1)}%)`);
  console.log();

  console.log("Removed by reason:");
  for (const [reason, count] of Object.entries(removedByReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason}: ${count}`);
    if (removedExamples[reason]) {
      for (const ex of removedExamples[reason].slice(0, 5)) {
        console.log(`    - ${ex.slug} → "${ex.form}"`);
      }
    }
  }
  console.log();

  // Verify no duplicates remain
  const cleanedFormToSlugs = new Map<string, string[]>();
  for (const entry of cleaned) {
    for (const sf of entry.surfaceForms) {
      const norm = normalizeForm(sf);
      const existing = cleanedFormToSlugs.get(norm) || [];
      existing.push(entry.slug);
      cleanedFormToSlugs.set(norm, existing);
    }
  }
  const remainingDuplicates = [...cleanedFormToSlugs.entries()].filter(([_, slugs]) => slugs.length > 1);
  console.log(`Remaining duplicates after cleanup: ${remainingDuplicates.length}`);
  if (remainingDuplicates.length > 0) {
    console.log("Sample remaining duplicates:");
    for (const [form, slugs] of remainingDuplicates.slice(0, 10)) {
      console.log(`  "${form}" → ${slugs.join(", ")}`);
    }
  }
  console.log();

  // Count entries with at least one form
  const entriesWithForms = cleaned.filter(e => e.surfaceForms.length > 0).length;
  console.log(`Entries with at least one surface form: ${entriesWithForms} / ${cleaned.length}`);

  if (write) {
    const outPath = "data/ingredient-ontology-cleaned.json";
    fs.writeFileSync(outPath, JSON.stringify(cleaned, null, 2));
    console.log(`\nWritten to ${outPath}`);
  } else {
    console.log("\nDry run. Use --write to save cleaned version.");
  }
}

main();
