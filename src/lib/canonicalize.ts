/**
 * Multi-resolution canonicalization for food descriptions.
 *
 * Pure function — no database access, fully deterministic and testable.
 * Implements the spec at docs/canonicalization.md (Steps 2–6).
 */

export interface CanonicalResult {
  baseName: string;
  baseSlug: string;
  specificName: string;
  specificSlug: string;
  removedTokens: string[];
  keptTokens: string[];
}

// ---------------------------------------------------------------------------
// State tokens to remove (from src/types/fdc.ts enum values)
// ---------------------------------------------------------------------------

const COOKING_STATES = ["raw", "cooked"];

const COOKING_METHODS = [
  "baked", "blanched", "boiled", "braised", "broiled", "fried", "grilled",
  "microwaved", "poached", "roasted", "sauteed", "scrambled", "simmered",
  "smoked", "steamed", "stewed", "stir-fried", "stir_fried", "toasted",
  "pan-fried", "pan_fried", "deep-fried", "deep_fried",
];

const PRESERVATION = [
  "fresh", "frozen", "canned", "dried", "cured",
  "pickled", "fermented", "smoked", "shelf-stable", "shelf_stable",
];

const PROCESSING = [
  "whole", "ground", "sliced", "diced", "shredded",
  "pureed", "paste", "powder", "flour", "juice", "oil", "broth", "stock",
];

const PREPARATION_PHRASES = [
  "prepared-from-recipe", "prepared from recipe",
  "ready-to-serve", "ready to serve",
  "unprepared",
];

// Build a single set of all state tokens for efficient lookup + removal
const ALL_STATE_TOKENS = new Set([
  ...COOKING_STATES,
  ...COOKING_METHODS,
  ...PRESERVATION,
  ...PROCESSING,
  ...PREPARATION_PHRASES,
]);

// Build regex patterns for multi-word tokens first, then single-word
// Sort by length descending so longer patterns match before shorter ones
const STATE_TOKEN_PATTERNS: RegExp[] = [...ALL_STATE_TOKENS]
  .sort((a, b) => b.length - a.length)
  .map((token) => new RegExp(`\\b${token.replace(/[-_]/g, "[\\s\\-_]")}\\b`, "gi"));

// ---------------------------------------------------------------------------
// Boilerplate prefixes to strip (v1: alcohol only)
// ---------------------------------------------------------------------------

const BOILERPLATE_PREFIXES = [
  "alcoholic beverage,",
];

// ---------------------------------------------------------------------------
// Pipeline steps
// ---------------------------------------------------------------------------

/** Step 3.1: Normalize text */
function normalize(desc: string): string {
  let text = desc.trim();
  // Normalize curly quotes to straight
  text = text.replace(/[\u2018\u2019]/g, "'");
  text = text.replace(/[\u201C\u201D]/g, '"');
  // Em/en dashes to hyphens
  text = text.replace(/[\u2013\u2014]/g, "-");
  // Collapse whitespace
  text = text.replace(/\s+/g, " ");
  return text;
}

/** Step 3.2: Remove parentheticals, return cleaned text and removed fragments */
function removeParentheticals(text: string): { cleaned: string; removed: string[] } {
  const removed: string[] = [];
  const cleaned = text.replace(/\([^)]*\)/g, (match) => {
    removed.push(match);
    return "";
  });
  return { cleaned: cleanupCommas(cleaned), removed };
}

/** Step 3.3: Remove boilerplate prefixes */
function removeBoilerplatePrefixes(text: string): { cleaned: string; removed: string[]; isAlcohol: boolean } {
  const lower = text.toLowerCase();
  for (const prefix of BOILERPLATE_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return {
        cleaned: text.slice(prefix.length).trim(),
        removed: [text.slice(0, prefix.length).trim()],
        isAlcohol: prefix === "alcoholic beverage,",
      };
    }
  }
  return { cleaned: text, removed: [], isAlcohol: false };
}

/** Step 3.4: Remove brand tokens (all-caps comma segments from original description) */
function removeBrandTokens(original: string, text: string): { cleaned: string; removed: string[] } {
  const removed: string[] = [];

  // Check each comma-separated segment of the original description.
  // A segment is a "brand" if every word in it is all-caps (>= 2 letter chars each).
  const originalSegments = original.split(",").map((s) => s.trim());
  const brandSegments: string[] = [];

  for (const seg of originalSegments) {
    if (!seg) continue;
    const words = seg.split(/\s+/);
    const allCaps = words.every((word) => {
      const letters = word.replace(/[^a-zA-Z]/g, "");
      return letters.length >= 2 && letters === letters.toUpperCase() && /[A-Z]/.test(letters);
    });
    if (allCaps) {
      brandSegments.push(seg);
    }
  }

  if (brandSegments.length === 0) return { cleaned: text, removed };

  // Remove brand segments from the working text
  let result = text;
  for (const brand of brandSegments) {
    const lower = brand.toLowerCase();
    const regex = new RegExp(`\\b${escapeRegex(lower)}\\b`, "gi");
    if (regex.test(result)) {
      removed.push(brand);
      result = result.replace(regex, "");
    }
  }

  return { cleaned: cleanupCommas(result), removed };
}

/** Step 3.5: Remove state tokens */
function removeStateTokens(text: string): { cleaned: string; removed: string[] } {
  const removed: string[] = [];
  let result = text;

  // Check for "dry roasted" / "dry heat" before removing "dried"
  // These are cooking methods, not preservation
  const dryMethodPattern = /\bdry[\s-](?:roast|heat)/gi;
  const hasDryMethod = dryMethodPattern.test(result);

  for (const pattern of STATE_TOKEN_PATTERNS) {
    const match = result.match(pattern);
    if (match) {
      // Skip "dried" if it's part of "dry roasted" / "dry heat"
      const token = match[0].toLowerCase().replace(/[\s\-_]+/g, " ").trim();
      if (token === "dried" && hasDryMethod) continue;

      removed.push(match[0].trim());
      result = result.replace(pattern, "");
    }
  }

  return { cleaned: cleanupCommas(result), removed };
}

/** Step 4: Extract base canonical name */
function extractBase(segments: string[], isAlcohol: boolean): string {
  if (segments.length === 0) return "unknown";

  if (isAlcohol) {
    // Domain rules for alcohol
    if (segments.some((s) => s === "beer")) return "beer";
    if (segments.some((s) => s === "wine")) return "wine";
    if (segments[0] === "distilled") return "distilled spirits";
    if (segments[0] === "liqueur") return "liqueur";
  }

  // Generic: first segment, trim trailing punctuation
  const base = segments[0].replace(/[,;:.!?]+$/, "").trim();
  return base || "unknown";
}

/** Step 5: Extract specific canonical name */
function extractSpecific(base: string, segments: string[], isAlcohol: boolean): string {
  if (!isAlcohol) {
    // Non-alcohol juice rule
    if (!base.endsWith("juice") && segments.some((s) => s === "juice")) {
      return `${base} juice`;
    }
    return base;
  }

  // Alcohol domain rules
  if (base === "beer") {
    if (segmentsContain(segments, "light")) return "light beer";
    if (segmentsContain(segments, "regular")) return "beer";
    if (segmentsContain(segments, "low carb")) return "low-carb beer";
    return "beer";
  }

  if (base === "wine") {
    if (segmentsContain(segments, "cooking")) return "cooking wine";
    if (segmentsContain(segments, "table") && segmentsContain(segments, "red")) return "red wine";
    if (segmentsContain(segments, "dessert")) return "dessert wine";
    if (segmentsContain(segments, "light")) return "light wine";
    return "wine";
  }

  if (base === "distilled spirits") {
    if (segmentsContain(segments, "vodka")) return "vodka";
    if (segmentsContain(segments, "rum")) return "rum";
    if (segmentsContain(segments, "whiskey")) return "whiskey";
    if (segmentsContain(segments, "gin")) return "gin";
    return "distilled spirits";
  }

  if (base === "liqueur") {
    // Check multi-word first
    if (segments.some((s) => s.includes("coffee") && s.includes("cream"))) return "coffee liqueur with cream";
    if (segmentsContain(segments, "coffee")) return "coffee liqueur";
    return "liqueur";
  }

  return base;
}

/** Step 6: Slugify a canonical name */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function canonicalizeDescription(description: string): CanonicalResult {
  const allRemoved: string[] = [];

  // Step 3.1: Normalize (keep original for brand detection)
  const normalized = normalize(description);

  // Step 3.2: Remove parentheticals
  const parens = removeParentheticals(normalized);
  let text = parens.cleaned;
  allRemoved.push(...parens.removed);

  // Step 3.3: Remove boilerplate prefixes
  const boilerplate = removeBoilerplatePrefixes(text);
  text = boilerplate.cleaned;
  allRemoved.push(...boilerplate.removed);
  const isAlcohol = boilerplate.isAlcohol;

  // Step 3.4: Remove brand tokens (uses original for case detection)
  const brands = removeBrandTokens(normalized, text);
  text = brands.cleaned;
  allRemoved.push(...brands.removed);

  // Lowercase for parsing (after brand detection which needs mixed case)
  text = text.toLowerCase();

  // Step 3.5: Remove state tokens
  const states = removeStateTokens(text);
  text = states.cleaned;
  allRemoved.push(...states.removed);

  // Step 4-5: Split into segments, extract base and specific
  const segments = text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const baseName = extractBase(segments, isAlcohol);
  const specificName = extractSpecific(baseName, segments, isAlcohol);

  return {
    baseName,
    baseSlug: slugify(baseName),
    specificName,
    specificSlug: slugify(specificName),
    removedTokens: allRemoved.filter(Boolean),
    keptTokens: segments,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanupCommas(text: string): string {
  return text
    .replace(/,\s*,/g, ",")    // collapse double commas
    .replace(/\s+/g, " ")       // collapse whitespace
    .replace(/^[,\s]+/, "")     // trim leading commas/spaces
    .replace(/[,\s]+$/, "")     // trim trailing commas/spaces
    .trim();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function segmentsContain(segments: string[], value: string): boolean {
  return segments.some((s) => s === value || s.includes(value));
}
