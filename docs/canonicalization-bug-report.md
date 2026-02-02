# Canonicalization Bug Report

**Date:** 2026-02-02  
**Files Reviewed:**
- `scripts/backfill-canonical-names.ts`
- `src/lib/canonicalize.ts`

---

## Issues

### 1. Rollback Scope Mismatch

**Severity:** Low  
**File:** `scripts/backfill-canonical-names.ts`  
**Line:** 221

**Description:**  
The error handler calls `await sql('ROLLBACK')`, but no transaction was started with `BEGIN`. The script uses individual `UPSERT` statements per batch, so there's nothing to roll back.

**Impact:**  
The `ROLLBACK` will either fail silently or produce a warning. No data corruption risk.

**Fix:**  
Either remove the `ROLLBACK` call, or wrap the entire backfill in a proper `BEGIN`/`COMMIT` transaction.

---

### 2. Force Flag Unused

**Severity:** Low  
**File:** `scripts/backfill-canonical-names.ts`  
**Lines:** 30, 134

**Description:**  
The `--force` flag is parsed and stored in `args.force`, but it's never used. The script always re-canonicalizes all rows regardless of whether they already have canonical names.

**Impact:**  
No functional impact since the current behavior (always update) is correct for a backfill. The flag is just dead code.

**Fix:**  
Either:
- Remove the `--force` flag entirely
- Implement incremental mode: skip foods where `description_hash` matches

---

### 3. Empty Base Name on Edge Cases

**Severity:** Medium  
**File:** `src/lib/canonicalize.ts`  
**Lines:** 244-247

**Description:**  
If a description consists entirely of removable tokens (e.g., `"raw, organic"`), the base name could become an empty string after normalization.

**Current behavior:**
```typescript
const baseName = baseTokens.join(', ') || '';
```

**Impact:**  
Could produce rows with empty `canonical_name` and empty `canonical_slug`, which would fail the `NOT NULL` constraint or create unusable entries.

**Fix:**  
Return a fallback value when base is empty:
```typescript
const baseName = baseTokens.join(', ') || 'unknown';
```

---

### 4. Missing "Gin" in Distilled Spirits

**Severity:** Low  
**File:** `src/lib/canonicalize.ts`  
**Line:** 72

**Description:**  
The `DISTILLED_SPIRITS` set includes vodka, whiskey, rum, tequila, brandy, and cognac—but not gin.

**Impact:**  
Gin-based foods won't have "distilled spirits" recognized as a base category if that logic is ever extended.

**Fix:**
```typescript
const DISTILLED_SPIRITS = new Set([
  'vodka', 'whiskey', 'rum', 'tequila', 'brandy', 'cognac', 'gin'
]);
```

---

## Summary

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Rollback scope mismatch | Low | Open |
| 2 | Force flag unused | Low | Open |
| 3 | Empty base name edge case | Medium | Open |
| 4 | Missing gin in spirits | Low | Open |

---

## Recommendation

Fix issue #3 (empty base name) before running the backfill in production. The other issues are low priority and can be addressed in a follow-up commit.
