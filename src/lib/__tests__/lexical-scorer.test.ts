import { describe, test, expect } from "vitest";
import {
  tokenize,
  classifyTokens,
  jaroWinkler,
  resolveInvertedName,
  pluralVariants,
  preNormalize,
  processFdcFood,
  processIngredient,
  buildIdfWeights,
  scoreCandidate,
  classifyScore,
  extractParentheticals,
  type ProcessedFdcFood,
  type IdfWeights,
} from "@/lib/lexical-scorer";

/**
 * CHANGELOG:
 * 2026-02-03 — Red team fixes:
 *   - Added tests for irregular plurals (fish, mice, teeth, geese, loaves)
 *   - Updated resolveInvertedName tests to expect "olive oil" not just "olive"
 */

// ---------------------------------------------------------------------------
// Helper: build a minimal IDF for testing (uniform weights)
// ---------------------------------------------------------------------------

function uniformIdf(): IdfWeights {
  return { weight: () => 1.0 };
}

function makeFdcFood(
  fdcId: number,
  description: string,
  categoryName: string | null = null,
  dataType: "sr_legacy" | "foundation" = "sr_legacy",
): ProcessedFdcFood {
  return processFdcFood(fdcId, description, dataType, categoryName);
}

function makeIngredient(name: string, idf: IdfWeights = uniformIdf()) {
  return processIngredient(name, idf);
}

// ===========================================================================
// Tokenizer
// ===========================================================================

describe("tokenize", () => {
  test("splits on non-alphanumeric boundaries", () => {
    expect(tokenize("Oil, olive, salad or cooking")).toEqual(
      expect.arrayContaining(["oil", "olive", "salad", "cooking"]),
    );
    // "or" is a stop word
    expect(tokenize("Oil, olive, salad or cooking")).not.toContain("or");
  });

  test("removes stop words", () => {
    const tokens = tokenize("with salt and pepper");
    expect(tokens).not.toContain("with");
    expect(tokens).not.toContain("and");
    expect(tokens).toContain("salt");
    expect(tokens).toContain("pepper");
  });

  test("deduplicates tokens", () => {
    const tokens = tokenize("chicken chicken chicken");
    expect(tokens).toEqual(["chicken"]);
  });

  test("handles hyphens by splitting", () => {
    const tokens = tokenize("extra-virgin olive oil");
    expect(tokens).toContain("olive");
    expect(tokens).toContain("oil");
  });

  test("filters tokens shorter than 2 chars", () => {
    const tokens = tokenize("a b cd ef");
    expect(tokens).not.toContain("a");
    expect(tokens).not.toContain("b");
    expect(tokens).toContain("cd");
    expect(tokens).toContain("ef");
  });
});

describe("classifyTokens", () => {
  test("separates core from state tokens", () => {
    const tokens = tokenize("chicken breast raw boneless");
    const { core, state } = classifyTokens(tokens);
    expect(core).toContain("chicken");
    expect(core).toContain("breast");
    expect(state).toContain("raw");
    expect(state).toContain("boneless");
    expect(core).not.toContain("raw");
  });

  test("preserves state tokens separately", () => {
    const tokens = tokenize("Oil, olive, salad or cooking");
    const { core, state } = classifyTokens(tokens);
    expect(core).toContain("oil");
    expect(core).toContain("olive");
    expect(core).toContain("salad");
    expect(core).toContain("cooking");
    expect(state).toHaveLength(0); // "cooking" is not in state set — it's a valid identity token for FDC
  });
});

// ===========================================================================
// TRIPWIRE: Word boundary correctness via tokenization
// ===========================================================================

describe("word boundary correctness (tokenizer-driven)", () => {
  test("'oil' is NOT a token of 'boiled'", () => {
    const tokens = tokenize("boiled");
    expect(tokens).not.toContain("oil");
    expect(tokens).toContain("boiled");
  });

  test("'oil' is NOT a token of 'broiled'", () => {
    const tokens = tokenize("broiled");
    expect(tokens).not.toContain("oil");
  });

  test("'oil' is NOT a token of 'foil'", () => {
    const tokens = tokenize("foil");
    expect(tokens).not.toContain("oil");
    expect(tokens).toContain("foil");
  });

  test("'oil' is NOT a token of 'coil' or 'toil'", () => {
    expect(tokenize("coil")).not.toContain("oil");
    expect(tokenize("toil")).not.toContain("oil");
  });

  test("'salt' is NOT a token of 'asphalt'", () => {
    const tokens = tokenize("asphalt");
    expect(tokens).not.toContain("salt");
    expect(tokens).toContain("asphalt");
  });

  test("'salt' is NOT a token of 'basalt' or 'cobalt'", () => {
    expect(tokenize("basalt")).not.toContain("salt");
    expect(tokenize("cobalt")).not.toContain("salt");
  });

  test("'corn' is NOT a token of 'corner'", () => {
    expect(tokenize("corner")).not.toContain("corn");
  });

  test("'ham' is NOT a token of 'champignon'", () => {
    expect(tokenize("champignon")).not.toContain("ham");
  });

  test("'oil' IS a token when it appears as a standalone word", () => {
    const tokens = tokenize("Oil, olive, salad or cooking");
    expect(tokens).toContain("oil");
  });
});

// ===========================================================================
// Jaro-Winkler
// ===========================================================================

describe("jaroWinkler", () => {
  test("identical strings return 1.0", () => {
    expect(jaroWinkler("olive oil", "olive oil")).toBe(1.0);
  });

  test("completely different strings return low score", () => {
    expect(jaroWinkler("olive oil", "zzzzz")).toBeLessThan(0.5);
  });

  test("similar strings return high score", () => {
    expect(jaroWinkler("olive oil", "olive oils")).toBeGreaterThan(0.9);
  });

  test("empty strings", () => {
    expect(jaroWinkler("", "")).toBe(1.0);
    expect(jaroWinkler("foo", "")).toBe(0.0);
    expect(jaroWinkler("", "bar")).toBe(0.0);
  });

  test("prefix bonus increases score", () => {
    const withPrefix = jaroWinkler("olivex", "olivey");
    const noPrefix = jaroWinkler("xolive", "yolive");
    expect(withPrefix).toBeGreaterThan(noPrefix);
  });
});

// ===========================================================================
// Inverted naming
// ===========================================================================

describe("resolveInvertedName", () => {
  test("container category: Oil, olive → olive oil", () => {
    const name = resolveInvertedName(["oil", "olive", "salad or cooking"]);
    expect(name).toBe("olive oil");
  });

  test("container + 3 segments: Spices, pepper, black → black pepper", () => {
    const name = resolveInvertedName(["spices", "pepper", "black"]);
    expect(name).toBe("black pepper");
  });

  test("protein base: Chicken, breast → chicken breast", () => {
    const name = resolveInvertedName(["chicken", "breast", "meat only"]);
    expect(name).toBe("chicken breast");
  });

  test("product form: Wheat, flour → wheat flour", () => {
    const name = resolveInvertedName(["wheat", "flour", "all-purpose"]);
    expect(name).toBe("wheat flour");
  });

  test("single segment", () => {
    expect(resolveInvertedName(["honey"])).toBe("honey");
  });

  test("empty segments", () => {
    expect(resolveInvertedName([])).toBe("");
  });
});

// ===========================================================================
// Plural variants
// ===========================================================================

describe("pluralVariants", () => {
  test("tomatoes → tomato", () => {
    expect(pluralVariants("tomatoes")).toContain("tomato");
  });

  test("tomato → tomatoes", () => {
    expect(pluralVariants("tomato")).toContain("tomatoes");
  });

  test("berries → berry", () => {
    expect(pluralVariants("berries")).toContain("berry");
  });

  test("leaves → leaf", () => {
    const variants = pluralVariants("leaves");
    expect(variants).toContain("leaf");
  });

  // P1 fix: irregular plurals
  test("fish is invariant (no 'fishs' variant)", () => {
    // Fish is invariant plural - the mapping returns 'fish' for 'fish'
    // which filters out because v === name. Main point: 'fishs' should not be in variants.
    const variants = pluralVariants("fish");
    expect(variants).not.toContain("fishs");
  });

  test("mice → mouse", () => {
    expect(pluralVariants("mice")).toContain("mouse");
  });

  test("mouse → mice", () => {
    expect(pluralVariants("mouse")).toContain("mice");
  });

  test("teeth → tooth", () => {
    expect(pluralVariants("teeth")).toContain("tooth");
  });

  test("geese → goose", () => {
    expect(pluralVariants("geese")).toContain("goose");
  });

  test("loaves → loaf", () => {
    expect(pluralVariants("loaves")).toContain("loaf");
  });

  test("loaf → loaves", () => {
    expect(pluralVariants("loaf")).toContain("loaves");
  });
});

// ===========================================================================
// Parenthetical extraction
// ===========================================================================

describe("extractParentheticals", () => {
  test("extracts alternate names", () => {
    const result = extractParentheticals("Coriander (cilantro) leaves, raw");
    expect(result).toContain("cilantro");
  });

  test("filters noise patterns", () => {
    const result = extractParentheticals("Butter (includes yellow and white)");
    expect(result).toHaveLength(0);
  });
});

// ===========================================================================
// Pre-normalization
// ===========================================================================

describe("preNormalize", () => {
  test("X, juice of → X juice", () => {
    expect(preNormalize("lemon, juice of")).toBe("lemon juice");
  });

  test("X, zest of → X zest", () => {
    expect(preNormalize("lemon, zest of")).toBe("lemon zest");
  });

  test("strips leading 'of'", () => {
    expect(preNormalize("of fresh mint")).toBe("fresh mint");
  });

  test("& → and", () => {
    expect(preNormalize("salt & pepper")).toBe("salt and pepper");
  });
});

// ===========================================================================
// Full scoring: medical correctness tests
// ===========================================================================

describe("scoreCandidate — medical correctness", () => {
  const idf = uniformIdf();

  test("'oil' scores higher against 'Oil, vegetable' than 'boiled vegetables'", () => {
    const ing = makeIngredient("oil", idf);
    const oilFood = makeFdcFood(1, "Oil, vegetable, soybean, refined", "Fats and Oils");
    const boiledFood = makeFdcFood(2, "Asparagus, cooked, boiled, drained", "Vegetables and Vegetable Products");

    const oilScore = scoreCandidate(ing, oilFood, idf);
    const boiledScore = scoreCandidate(ing, boiledFood, idf);

    expect(oilScore.score).toBeGreaterThan(boiledScore.score);
    expect(oilScore.score).toBeGreaterThan(0.5);
    expect(boiledScore.score).toBeLessThan(0.3);
  });

  test("'butter' scores higher against 'Butter, salted' than 'Cookies, butter'", () => {
    const ing = makeIngredient("butter", idf);
    const butterFood = makeFdcFood(1, "Butter, salted", "Dairy and Egg Products");
    const cookieFood = makeFdcFood(2, "Cookies, butter, commercially prepared, enriched", "Baked Products");

    const butterScore = scoreCandidate(ing, butterFood, idf);
    const cookieScore = scoreCandidate(ing, cookieFood, idf);

    expect(butterScore.score).toBeGreaterThan(cookieScore.score);
    expect(butterScore.score).toBeGreaterThan(0.5);
  });

  test("'sugar' scores higher against 'Sugar, turbinado' than 'Cookies, sugar'", () => {
    const ing = makeIngredient("sugar", idf);
    const sugarFood = makeFdcFood(1, "Sugar, turbinado", "Sweets");
    const cookieFood = makeFdcFood(2, "Cookies, sugar, refrigerated dough, baked", "Baked Products");

    const sugarScore = scoreCandidate(ing, sugarFood, idf);
    const cookieScore = scoreCandidate(ing, cookieFood, idf);

    expect(sugarScore.score).toBeGreaterThan(cookieScore.score);
  });

  test("'olive oil' maps to 'Oil, olive' not 'Olives, green, raw'", () => {
    const ing = makeIngredient("olive oil", idf);
    const oilFood = makeFdcFood(1, "Oil, olive, salad or cooking", "Fats and Oils");
    const oliveFood = makeFdcFood(2, "Olives, green, raw", "Vegetables and Vegetable Products");

    const oilScore = scoreCandidate(ing, oilFood, idf);
    const oliveScore = scoreCandidate(ing, oliveFood, idf);

    expect(oilScore.score).toBeGreaterThan(oliveScore.score);
    expect(oilScore.score).toBeGreaterThan(THRESHOLD_MAPPED);
  });

  test("'olive' (the fruit) maps to 'Olives' not 'Oil, olive'", () => {
    const ing = makeIngredient("olive", idf);
    const olivesFood = makeFdcFood(1, "Olives, ripe, canned (small-extra large)", "Vegetables and Vegetable Products");
    const oilFood = makeFdcFood(2, "Oil, olive, salad or cooking", "Fats and Oils");

    const olivesScore = scoreCandidate(ing, olivesFood, idf);
    const oilScore = scoreCandidate(ing, oilFood, idf);

    // "olive" as a single token: olives has category Vegetables (no explicit expectation
    // for "olive" in CATEGORY_EXPECTATIONS, so neutral). But "Olives" contains the token
    // "olives" which is a plural variant of "olive" → should score well on overlap.
    // "Oil, olive" also contains "olive" but primary segment is "oil" not "olive",
    // so segment score should be lower.
    expect(olivesScore.score).toBeGreaterThanOrEqual(oilScore.score);
  });
});

// ===========================================================================
// Threshold classification
// ===========================================================================

const THRESHOLD_MAPPED = 0.80;

describe("classifyScore", () => {
  test("high score → mapped", () => {
    expect(classifyScore(0.85)).toBe("mapped");
    expect(classifyScore(0.80)).toBe("mapped");
  });

  test("medium score → needs_review", () => {
    expect(classifyScore(0.60)).toBe("needs_review");
    expect(classifyScore(0.40)).toBe("needs_review");
  });

  test("low score → no_match", () => {
    expect(classifyScore(0.30)).toBe("no_match");
    expect(classifyScore(0.0)).toBe("no_match");
  });
});

// ===========================================================================
// IDF weights
// ===========================================================================

describe("buildIdfWeights", () => {
  test("common tokens get lower weight than rare tokens", () => {
    const foods = [
      makeFdcFood(1, "Salt, table", "Spices and Herbs"),
      makeFdcFood(2, "Salt, sea", "Spices and Herbs"),
      makeFdcFood(3, "Oil, olive, salad or cooking", "Fats and Oils"),
    ];
    const idf = buildIdfWeights(foods);

    // "salt" appears in 2 foods, "olive" in 1
    // w(salt) = 1/log(2+2) = 1/log(4), w(olive) = 1/log(2+1) = 1/log(3)
    // 1/log(3) > 1/log(4)
    expect(idf.weight("olive")).toBeGreaterThan(idf.weight("salt"));
  });

  test("unknown tokens get default weight", () => {
    const foods = [makeFdcFood(1, "Salt, table")];
    const idf = buildIdfWeights(foods);
    // df("zzz") = 0, w = 1/log(2+0) = 1/log(2)
    expect(idf.weight("zzz")).toBeCloseTo(1 / Math.log(2), 5);
  });
});

// ===========================================================================
// Full food processing
// ===========================================================================

describe("processFdcFood", () => {
  test("pre-computes all fields correctly", () => {
    const food = makeFdcFood(171413, "Oil, olive, salad or cooking", "Fats and Oils");

    expect(food.segments).toEqual(["oil", "olive", "salad or cooking"]);
    expect(food.coreTokenSet.has("oil")).toBe(true);
    expect(food.coreTokenSet.has("olive")).toBe(true);
    // P0 fix: now returns full inverted name "olive oil"
    expect(food.invertedName).toBe("olive oil");
    expect(food.slug).toBe("olive-oil");
  });

  test("extracts parentheticals", () => {
    const food = makeFdcFood(1, "Coriander (cilantro) leaves, raw");
    expect(food.parentheticals).toContain("cilantro");
  });
});
