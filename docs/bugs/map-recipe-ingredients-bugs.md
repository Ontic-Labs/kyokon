# Bug Report: map-recipe-ingredients.ts

**Last Updated:** 2026-02-02 (v2)

## Summary

Issues in the recipe-to-FDC ingredient mapping script. Most critical issues from v1 have been addressed.

---

## ✅ Fixed Since Last Review (v1 → v2)

### From v1 Bug Report:

1. **~~`ingredient_norm` uses slugified form~~** — Now stores `ing.name.toLowerCase().trim()` (line 1017) as intended. Column semantics are correct.

2. **~~Slug collision detected too late~~** — Now detected and merged at load time in `loadRecipeIngredients()` (lines 91-106). Higher-frequency name wins.

3. **~~No frequency floor by default~~** — Now defaults to `DEFAULT_MIN_FREQ = 25` (line 1199).

4. **~~No progress indicator~~** — Added progress output every 500 ingredients (lines 1217-1220).

5. **~~Leading-word strip over-matches~~** — Added `MEANINGFUL_MODIFIERS` set (lines 927-930) to preserve "brown", "dark", "sweet", etc.

6. **~~Alias target → canonical lookup fails~~** — Now creates canonical on-demand when alias target isn't a recipe ingredient (lines 1101-1123).

7. **~~Many problematic aliases~~** — Removed or commented out:
   - ✅ `"hot sauce"` → `"hot chile"` removed
   - ✅ `"tabasco sauce"` → `"pepper"` removed  
   - ✅ `"spaghetti sauce"` → `"pasta"` removed
   - ✅ `"chicken stock"` → `"soup"` removed (let substring find)
   - ✅ `"vegetable stock"` → `"soup"` removed
   - ✅ `"evaporated milk"` → `"milk"` removed
   - ✅ `"cool whip"` → `"cream"` removed
   - ✅ `"almond extract"` → `"almond"` removed
   - ✅ Plural/singular aliases removed (handled by `pluralVariants()`)

### From Original Review:

8. **~~`pluralVariant` produces invalid forms~~** — Already fixed in v1.

9. **~~`extractParentheticals` captures noise~~** — Already fixed in v1.

10. **~~Alias target validation missing~~** — Already fixed in v1.

---

## 🟠 Logic Bugs (Remaining)

### 1. Slug collision merge uses wrong comparison

**Location:** Lines 97-101

```typescript
slugCollisions.push(`  ${s}: "${existing.name}" (${existing.frequency}) + "${name}" (${freq}) → merged`);
existing.frequency += freq;
if (freq > existing.frequency) existing.name = name;
```

**Bug:** The comparison `freq > existing.frequency` happens _after_ `existing.frequency += freq`, so `freq` (original frequency of collision candidate) is always less than the updated `existing.frequency`. The name never changes.

**Example:**
- "jalapeño peppers" (freq: 100) loaded first → stored
- "jalapeno peppers" (freq: 200) → collision
- `existing.frequency` = 100 + 200 = 300
- `if (200 > 300)` → false, keeps "jalapeño peppers"
- Should have picked "jalapeno peppers" (higher original frequency)

**Fix:** Compare before accumulating:
```typescript
if (freq > existing.frequency) existing.name = name;
existing.frequency += freq;
```

---

### 2. `preNormalize` strips quantity prefix but may break ingredient names

**Location:** Lines 304-305

```typescript
// Strip leading numeric quantity (e.g. "2% low-fat milk" → "low-fat milk")
n = n.replace(/^\d+%?\s+/, "");
```

**Edge cases:**
- "7up" → "up" ❌
- "3 musketeers" → "musketeers" ❌ (candy bar)
- "100% whole wheat flour" → "whole wheat flour" ✓ (correct)

**Impact:** Low — these ingredients are rare, but brand names with leading numbers get corrupted.

**Fix:** Require a space after `%`: `/^\d+%\s+/` or skip stripping for known brand patterns.

---

### 3. Alias fallback substring still searches only the target

**Location:** Lines 844-853

**Description:** When alias exact match fails, substring search uses `alias` (the target name), not the original ingredient. If target doesn't appear in FDC descriptions verbatim, no match.

**Example:**
- Alias: `["graham cracker crumbs", "graham"]`
- Target "graham" is too short (< 4 chars) → substring fallback skipped
- "graham cracker crumbs" could match "Crackers, graham" but doesn't try ingredient name

**Fix:** Also try substring search with the original ingredient name when alias target fails.

---

### 4. Priority capping still discards Foundation data when SR Legacy exceeds cap

**Location:** Lines 714-726

**Description:** If SR Legacy matches > 200, Foundation is entirely dropped. Foundation often has newer, more accurate data.

**Example:** Generic ingredient like "beef" matches 250 SR Legacy foods → Foundation beef entries (with updated Atwater factors) discarded.

**Impact:** Newer nutritional data not used for some high-match-count ingredients.

---

## 🟡 Data Quality (Remaining)

### 5. Several aliases still have questionable semantics

| Alias | Target | Concern |
|-------|--------|---------|
| `"cream of mushroom soup"` | `"soup"` | Matches all soups, not specifically cream of mushroom |
| `"cream of chicken soup"` | `"soup"` | Same issue |
| `"graham cracker crumbs"` | `"graham"` | "graham" matches graham flour, not crackers |
| `"zucchini"` | `"squash"` | Zucchini is a specific squash variety with different profile |
| `"crabmeat"` | `"crustaceans"` | Generic container, not specific to crab |
| `"fresh coriander"` | `"coriander seed"` | Fresh herb ≠ dried seed (vitamin C, etc.) |

**Fix:** Let substring matching find the correct FDC entries, or create more specific aliases.

---

### 6. `["capers", "capers"]` is a no-op alias

**Location:** Line 609

```typescript
["capers", "capers"],
```

**Description:** Alias points to itself — does nothing. Wastes a lookup.

**Fix:** Remove this entry.

---

## 🟣 Performance (Remaining)

### 7. Substring fallback is still O(n) per ingredient

**Location:** Lines 952-964

**Description:** For each unmatched ingredient, scans all FDC foods (~8k for SR+Foundation, more with branded).

**Observed:** Acceptable for SR+Foundation only (~8k foods), but adds significant time with branded (~500k foods).

**Mitigation:** The progress indicator helps visibility, but performance optimization (trigram index or database search) would still be valuable for branded data.

---

### 8. Memory usage with branded data

**Location:** Line 272

```typescript
return { bySpecificName, bySpecificSlug, byBaseName, byBaseSlug, byParenthetical, all: foods };
```

**Description:** `all: foods` stores entire array in memory for substring fallback. With 500k+ branded foods, this uses 300-500MB RAM.

**Mitigation:** SR Legacy + Foundation only uses ~10MB. Issue only manifests when processing branded data.

---

## 🔵 Missing Functionality (Remaining)

### 9. No `--output` flag for dry-run inspection

Can't save match results to JSON for review before writing. Only console output.

---

### 10. No `--strict` flag to abort on warnings

Orphaned alias warnings don't block `--write`. Add `--strict` to fail fast on any warnings.

---

### 11. Alias creation race condition in transaction

**Location:** Lines 1101-1123

**Description:** On-demand canonical creation for alias targets happens inside the alias loop. If two aliases point to the same target, the second `INSERT ... ON CONFLICT` adds to `total_count`:

```typescript
ON CONFLICT (canonical_slug) DO UPDATE SET
  total_count = canonical_ingredient.total_count + EXCLUDED.total_count,
```

This double-counts frequency if the same target is created twice.

**Impact:** Low — would need two aliases with same target where both are recipe ingredients but target isn't. Rare.

---

## Recommended Fix Priority

| # | Issue | Effort | Impact | Status |
|---|-------|--------|--------|--------|
| 1 | Fix slug collision comparison order | Trivial | Medium | New |
| 2 | Audit remaining alias semantics | Low | Medium | Ongoing |
| 3 | Remove `["capers", "capers"]` no-op | Trivial | Trivial | New |
| 4 | Improve alias fallback (try ingredient name) | Low | Low | Open |
| 5 | Add `--output` flag | Low | Low | Open |
| 6 | Add `--strict` flag | Low | Low | Open |
| 7 | Foundation data preservation in priority cap | Medium | Low | Open |

---

## Summary

**Overall health: Good.** The major issues from v1 have been addressed:
- Slug collision detection moved early ✓
- `ingredient_norm` semantics fixed ✓
- Default frequency floor added ✓
- Progress indicator added ✓
- Meaningful modifier preservation added ✓
- Alias target on-demand creation added ✓
- Problematic aliases removed ✓

Remaining issues are minor (comparison order bug, a few questionable aliases, performance with large datasets).
