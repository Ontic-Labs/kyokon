#!/usr/bin/env npx tsx
/**
 * Dry-run cooking method extraction from Food.com recipes
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../src/lib/db";

// ---------------------------------------------------------------------------
// Cooking method extraction
// ---------------------------------------------------------------------------

const COOKING_METHOD_MAP = new Map<string, string>([
  ["bake", "baked"], ["bakes", "baked"], ["baking", "baked"],
  ["blanch", "blanched"], ["blanches", "blanched"], ["blanching", "blanched"],
  ["blend", "blended"], ["blends", "blended"], ["blending", "blended"],
  ["boil", "boiled"], ["boils", "boiled"], ["boiling", "boiled"],
  ["braise", "braised"], ["braises", "braised"], ["braising", "braised"],
  ["broil", "broiled"], ["broils", "broiled"], ["broiling", "broiled"],
  ["fry", "fried"], ["fries", "fried"], ["frying", "fried"],
  ["deep-fry", "fried"], ["deep fry", "fried"],
  ["pan-fry", "fried"], ["pan fry", "fried"],
  ["stir-fry", "fried"], ["stir fry", "fried"],
  ["grill", "grilled"], ["grills", "grilled"], ["grilling", "grilled"],
  ["marinate", "marinated"], ["marinates", "marinated"], ["marinating", "marinated"],
  ["microwave", "microwaved"], ["microwaves", "microwaved"], ["microwaving", "microwaved"],
  ["poach", "poached"], ["poaches", "poached"], ["poaching", "poached"],
  ["roast", "roasted"], ["roasts", "roasted"], ["roasting", "roasted"],
  ["saute", "sauteed"], ["sautes", "sauteed"], ["sauteing", "sauteed"],
  ["sauté", "sauteed"], ["sautés", "sauteed"], ["sautéing", "sauteed"],
  ["scramble", "scrambled"], ["scrambles", "scrambled"], ["scrambling", "scrambled"],
  ["simmer", "simmered"], ["simmers", "simmered"], ["simmering", "simmered"],
  ["slow-cook", "slow-cooked"], ["slow cook", "slow-cooked"], ["slow-cooking", "slow-cooked"],
  ["crockpot", "slow-cooked"], ["crock pot", "slow-cooked"], ["crock-pot", "slow-cooked"],
  ["steam", "steamed"], ["steams", "steamed"], ["steaming", "steamed"],
  ["toast", "toasted"], ["toasts", "toasted"], ["toasting", "toasted"],
  // Past tense → past tense
  ["baked", "baked"], ["blanched", "blanched"], ["blended", "blended"],
  ["boiled", "boiled"], ["braised", "braised"], ["broiled", "broiled"],
  ["fried", "fried"], ["grilled", "grilled"], ["marinated", "marinated"],
  ["melted", "melted"], ["microwaved", "microwaved"], ["poached", "poached"],
  ["roasted", "roasted"], ["sauteed", "sauteed"], ["scrambled", "scrambled"],
  ["simmered", "simmered"], ["slow-cooked", "slow-cooked"], ["steamed", "steamed"],
  ["toasted", "toasted"],
]);

// Patterns that indicate no-cook recipes
const NO_COOK_PATTERNS = [
  /no[- ]?cook/i,
  /no[- ]?bake/i,
  /uncooked/i,
  /\braw\b/i,
  /\bsalad\b/i,
  /\bdip\b/i,
  /\bdressing\b/i,
  /\bseasoning\s*mix\b/i,
  /\bspice\s*(mix|blend|rub)\b/i,
  /\bguacamole\b/i,
  /\bsalsa\b/i,
  /\bsmoothie\b/i,
  /\bbread\s*machine\b/i,  // Bread machine does the cooking
  /\bpuppy\s*chow\b/i,     // No-bake snack mix
  /\bchocolate\s*mix\b/i,  // Hot chocolate mix, etc.
  /\bself\s*rising\s*flour\b/i,  // Pantry staple, just mixing
  /\bmix\s*recipe\b/i,
  /\bspice\s*rub\b/i,
  /\bdry\s*rub\b/i,
  /\bhummus\b/i,          // Blended but not cooked
  /\bdeviled\s*eggs?\b/i, // Pre-cooked eggs
  /\blemonade\b/i,        // Beverage
  /\bcandy\s*(corn|mix)\b/i,  // Candy mixes
  /\bhorseradish\s*sauce\b/i, // Condiment
  /\bshortcake\b/i,       // Assembly recipe
  /\bsurprise\b.*\bcake\b|\bcake\b.*\bsurprise\b/i,  // Assembly desserts
  /\bice\s*cream\s*(pie|cake)\b/i,  // Frozen desserts
  /\bcombine\s*all\s*ingredients/i,  // Just mixing
  /\bfrosting\b/i,        // Frostings/icings
  /\bcheese\s*ball\b/i,   // Cheese ball appetizers
  /\btrifle\b/i,          // Layered desserts
  /\bsandwich(es)?\b/i,   // Sandwiches
  /\bpenguins?\b/i,       // Appetizer assembly (olive penguins etc)
  // Removed: /\bbites?\b/i - too broad, matches cooked recipes
  /\bsweet\s*and\s*sour\s*sauce\b/i,  // Cold sauce
  /\bcinnamon\s*sugar\b/i,  // Spice mix
  // Removed: /\bglaze\b/i - too broad, matches cooked recipes with glazes
  /\bstir\s*(sugar|together|in|well)/i,  // Just stirring/mixing
  /\bbeat\s*(cream\s*cheese|until)/i,  // Just beating/mixing
  /\bpinwheels?\b/i,      // Roll-up appetizers
  /\brollups?\b/i,        // Roll-up appetizers
  /\bmojito\b/i,          // Cocktail
  /\btzatziki\b/i,        // Cold sauce
  /\bboursin\b/i,         // Cheese spread
  /\bgarlic\s*butter\b/i, // Compound butter (mixing)
  /\bpickled?\b/i,        // Pickled items
  /\bkimchi\b/i,          // Fermented/pickled
  // Removed: /\bcucumbers?\b/i - too broad
  /\bwhipped\s*cream\b/i, // Just whipping
  /\bpie\s*(crust|pastry)\b/i,  // Crust prep (baking comes later)
  /\bice\s*cream\b/i,     // Frozen desserts
  /\bpuree\b/i,           // Pureeing
  /\bfood\s*processor\b/i, // Just processing
  /\bvinaigrette\b/i,    // Cold dressing
  /\bsubstitute\s*for\b/i, // Ingredient substitution (mixing)
  /\bseasoning\s*mix\b/i, // Seasoning blend (more specific)
  /\bitalian\s*seasoning\b/i, // Herb blend
  /\bspice\s*grinder\b/i, // Grinding spices (no heat)
  /\bflour\s*substitute\b/i, // Flour alternatives
  /\boranges?\b.*\bcinnamon\b|\bcinnamon\b.*\boranges?\b/i, // Citrus preparations
  /\bwhisk\s*all\s*ingredients\b/i, // Just whisking
  /\bcreamy\s*(white\s*)?glaze\b/i, // Frosting/icing type glazes
  /\bglaze\s*for\b/i,     // "Glaze for ham" etc - preparation
  /\bbite\s*sized\b/i,    // Cut into bites (no cooking)
  /\bapple\s*bites\b/i,   // Raw fruit snack
  /\bblt\s*bites\b/i,     // Assembly appetizer
];
  
// Step-based no-cook detection (if ALL steps are just mixing/assembly)
const NO_COOK_STEP_PATTERNS = [
  /^(mix|combine|stir|beat|whisk|blend|fold|cream|add|put|cut|slice|arrange|place|spread|layer|top|sprinkle|drizzle|pour|chill|refrigerate|freeze)\b/i,
];

// Temperature patterns that indicate cooking
const TEMP_PATTERNS: Array<{ pattern: RegExp; method: string }> = [
  // Oven temperatures → baked
  { pattern: /preheat\s*(the\s*)?(oven|convection)/i, method: "baked" },
  { pattern: /oven\s*to\s*\d+/i, method: "baked" },
  { pattern: /\b(350|375|400|425|450)\s*°?\s*f/i, method: "baked" },
  { pattern: /\b(180|190|200|220)\s*°?\s*c/i, method: "baked" },
  { pattern: /in\s*(the\s*)?oven/i, method: "baked" },
  
  // Grill temperatures
  { pattern: /preheat\s*(the\s*)?grill/i, method: "grilled" },
  { pattern: /grill\s*to\s*(high|medium|low|\d+)/i, method: "grilled" },
  { pattern: /on\s*(the\s*)?grill/i, method: "grilled" },
  
  // Deep frying temperatures
  { pattern: /\b(350|375)\s*°?\s*f.{0,20}(oil|fry)/i, method: "fried" },
  { pattern: /oil\s*to\s*\d+\s*°/i, method: "fried" },
  
  // Slow cooker temps and phrases
  { pattern: /slow\s*cooker\s*(on\s*)?(low|high)/i, method: "slow-cooked" },
  { pattern: /crock\s*pot/i, method: "slow-cooked" },
  { pattern: /crockpot/i, method: "slow-cooked" },
  { pattern: /slow\s*cook/i, method: "slow-cooked" },
  
  // Generic heating patterns → simmered (catch-all for stovetop)
  { pattern: /cook\s*(over|on)\s*(medium|low|high)\s*heat/i, method: "simmered" },
  { pattern: /heat\s*(over|on)\s*(medium|low|high)/i, method: "simmered" },
  { pattern: /bring\s*to\s*(a\s*)?boil/i, method: "boiled" },
  { pattern: /reduce\s*heat/i, method: "simmered" },
  { pattern: /over\s*(medium|low|high)(-\w+)?\s*heat/i, method: "simmered" },  // medium-high, medium-low
  { pattern: /(skillet|pan|pot|saucepan|wok)/i, method: "simmered" },  // Any mention of cookware
  { pattern: /on\s*(the\s*)?stove/i, method: "simmered" },
  { pattern: /cook\s*(the\s*)?(pasta|noodles|fettuccine|spaghetti)/i, method: "boiled" },
  { pattern: /according\s*to\s*package/i, method: "boiled" },  // "cook according to package"
  { pattern: /cook\s*(about|for)?\s*\d+\s*min/i, method: "simmered" },  // "cook about 4 minutes"
  
  // Roasting patterns
  { pattern: /in\s*(a\s*)?roaster/i, method: "roasted" },
  { pattern: /roasting\s*pan/i, method: "roasted" },
  
  // Melting (for candies, chocolate)
  { pattern: /melt\s*(the\s*)?(chocolate|butter|candy)/i, method: "melted" },
  { pattern: /double\s*boiler/i, method: "melted" },
  { pattern: /microwave.{0,30}melt/i, method: "microwaved" },
  
  // Additional baking clues
  { pattern: /in\s*a\s*\d+\s*x\s*\d+/i, method: "baked" },  // "in a 9x13 pan"
  { pattern: /grease\s*(a\s*)?\d+\s*x\s*\d+/i, method: "baked" },  // "grease 9x13 pan"
  { pattern: /grease\s*(the\s*)?(pan|baking)/i, method: "baked" },
  { pattern: /bread\s*(pan|machine)/i, method: "baked" },  // bread machine
  
  // Stovetop clues
  { pattern: /heat\s*(a\s*)?(small\s*)?(skillet|pan)/i, method: "sauteed" },
  { pattern: /toss\s*(till|until)/i, method: "sauteed" },
  { pattern: /rotisserie/i, method: "roasted" },
  { pattern: /pan[- ]?roast/i, method: "roasted" },  // pan-roast, pan roast
  { pattern: /slice.{0,40}(steak|beef|chicken|pork)/i, method: "sauteed" },  // fajitas prep
  { pattern: /cube\s*steaks?/i, method: "fried" },  // cube steaks are usually pan fried
  { pattern: /(salmon|crab|fish)\s*cakes?/i, method: "fried" },  // seafood cakes are fried
  { pattern: /stir\s*water/i, method: "simmered" },  // cooking step
];

function isNoCook(recipeName: string, steps: string[]): boolean {
  const text = recipeName + " " + steps.join(" ");
  return NO_COOK_PATTERNS.some(pattern => pattern.test(text));
}

function extractCookingMethods(recipeName: string, steps: string[]): string[] {
  const methods = new Set<string>();
  const text = recipeName + " " + steps.join(" ");
  const textLower = text.toLowerCase();
  const words = textLower.split(/\s+/);
  
  // Word-based detection
  for (const word of words) {
    const clean = word.replace(/[^a-zé-]/g, "");
    const normalized = COOKING_METHOD_MAP.get(clean);
    if (normalized) {
      methods.add(normalized);
    }
  }
  
  // Temperature-based detection
  for (const { pattern, method } of TEMP_PATTERNS) {
    if (pattern.test(text)) {
      methods.add(method);
    }
  }
  
  return [...methods].sort();
}

interface RecipeRow {
  recipe_id: number;
  name: string;
  steps: string[];
  ingredients: string[];
}

async function main() {
  console.log("Loading canary recipes...\n");
  
  const recipes = await db.query<RecipeRow>(`
    SELECT recipe_id, name, steps, ingredients
    FROM canary_top_rated_recipes
    ORDER BY recipe_id
  `);
  
  // Overall method counts
  const methodCounts = new Map<string, number>();
  const recipesWithMethods: Array<{ name: string; methods: string[]; ingredientCount: number }> = [];
  const noCookRecipes: string[] = [];
  const unknownRecipes: string[] = [];
  
  // Per-ingredient method tracking
  const ingredientMethodMap = new Map<string, Map<string, number>>();
  
  for (const recipe of recipes.rows) {
    const methods = extractCookingMethods(recipe.name, recipe.steps);
    
    if (methods.length > 0) {
      recipesWithMethods.push({
        name: recipe.name,
        methods,
        ingredientCount: recipe.ingredients.length,
      });
      
      // Count overall methods
      for (const m of methods) {
        methodCounts.set(m, (methodCounts.get(m) || 0) + 1);
      }
      
      // Track which methods each ingredient appears with
      for (const ing of recipe.ingredients) {
        if (!ingredientMethodMap.has(ing)) {
          ingredientMethodMap.set(ing, new Map());
        }
        const ingMethods = ingredientMethodMap.get(ing)!;
        for (const m of methods) {
          ingMethods.set(m, (ingMethods.get(m) || 0) + 1);
        }
      }
    } else if (isNoCook(recipe.name, recipe.steps)) {
      noCookRecipes.push(recipe.name);
      methodCounts.set("no-cook", (methodCounts.get("no-cook") || 0) + 1);
    } else {
      unknownRecipes.push(recipe.name);
    }
  }
  
  // Sort method counts
  const sortedMethods = [...methodCounts.entries()].sort((a, b) => b[1] - a[1]);
  
  console.log("=== Cooking Method Distribution ===");
  console.log(`Recipes with methods: ${recipesWithMethods.length} / ${recipes.rows.length} (${(100 * recipesWithMethods.length / recipes.rows.length).toFixed(1)}%)`);
  console.log(`No-cook recipes: ${noCookRecipes.length}`);
  console.log(`Unknown (no method detected): ${unknownRecipes.length}\n`);
  
  console.log("Method counts:");
  for (const [method, count] of sortedMethods) {
    const pct = (100 * count / recipesWithMethods.length).toFixed(1);
    console.log(`  ${method.padEnd(12)} ${count.toString().padStart(4)} recipes (${pct}%)`);
  }
  
  // Show sample recipes for each method
  console.log("\n=== Sample Recipes by Method ===");
  for (const method of ["baked", "fried", "grilled", "sauteed", "steamed"]) {
    console.log(`\n${method.toUpperCase()}:`);
    const samples = recipesWithMethods
      .filter(r => r.methods.includes(method))
      .slice(0, 3);
    for (const s of samples) {
      console.log(`  - ${s.name} (${s.methods.join(", ")})`);
    }
  }
  
  // Show ingredient-method associations
  console.log("\n=== Top Ingredient-Method Associations ===");
  
  // Find ingredients with strong method associations
  const associations: Array<{ ingredient: string; method: string; count: number }> = [];
  
  for (const [ing, methods] of ingredientMethodMap.entries()) {
    for (const [method, count] of methods.entries()) {
      if (count >= 3) {
        associations.push({ ingredient: ing, method, count });
      }
    }
  }
  
  associations.sort((a, b) => b.count - a.count);
  
  console.log("(ingredient → method, count ≥ 3):\n");
  for (const a of associations.slice(0, 30)) {
    console.log(`  ${a.count.toString().padStart(3)}x | ${a.ingredient} → ${a.method}`);
  }
  
  // Show no-cook recipes
  console.log("\n=== No-Cook Recipes (sample) ===");
  for (const name of noCookRecipes.slice(0, 10)) {
    console.log(`  - ${name}`);
  }
  
  // Show unknown recipes with their steps for debugging
  console.log("\n=== Unknown - No Method Detected (with step preview) ===");
  
  // Find the actual recipe data for unknowns
  const unknownWithSteps = recipes.rows
    .filter(r => {
      const methods = extractCookingMethods(r.name, r.steps);
      return methods.length === 0 && !isNoCook(r.name, r.steps);
    })
    .slice(0, 15);
  
  for (const r of unknownWithSteps) {
    const firstStep = r.steps[0]?.substring(0, 80) || "(no steps)";
    console.log(`  - ${r.name}`);
    console.log(`    Step 1: ${firstStep}...`);
  }
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
