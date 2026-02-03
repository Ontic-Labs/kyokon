# Lexical Entity-Mapping v2 — Python + Supabase Build Spec

## 0) Guiding constraints

* **Deterministic**: same inputs + same config → same outputs
* **Auditable**: persist ScoreBreakdown and a run manifest
* **No runtime scoring**: compiled results are stored; API reads them
* **Safe publishing**: stage → validate → promote (no blind truncation)

---

## 1) Runtime architecture

### Components

1. **Python scorer package** (`lexical_scorer/`) — pure functions, testable.
2. **Batch runner** (`scripts/map_recipe_ingredients_v2.py`) — orchestrates DB I/O and writes results.
3. **Supabase Postgres** — source of truth and output target.

### Why direct Postgres (psycopg) over `supabase-py`

* You will be moving **millions** of rows.
* REST inserts will be slower and more failure-prone.
* Postgres `COPY` / `executemany` is the correct tool.

**Use Supabase only as the DB**: connect via the **Supabase Postgres connection string**.

---

## 2) Tables and versioning strategy

### 2.1 Add a run table (recommended)

Create a run record so everything is traceable and revertible:

**`lexical_mapping_runs`**

* `run_id` (uuid)
* `created_at`
* `git_sha`
* `config_json` (weights/thresholds/stopwords/etc.)
* `idf_hash`
* `tokenizer_hash`
* `status` (`staging`, `validated`, `promoted`, `failed`)
* metrics columns (counts, distributions, etc.)

### 2.2 Stage outputs with `run_id`

Instead of truncating immediately, write to staging keyed by `run_id`.

**Option A (best):** add `run_id` to mapping tables

* `canonical_fdc_membership(run_id, ingredient_key, fdc_id, score, status, reason_codes, created_at)`
* optionally: `canonical_fdc_membership_candidates(run_id, ingredient_key, fdc_id, score)` for near ties
* optionally: `canonical_fdc_membership_breakdowns(run_id, ingredient_key, fdc_id, breakdown_json)`

**Option B:** separate staging tables

* `canonical_fdc_membership_staging` (same columns + run_id)

### 2.3 Promotion pointer

Add a single-row pointer table:

**`lexical_mapping_current`**

* `current_run_id` uuid
* `promoted_at`

Then API reads only rows where `run_id = current_run_id`.

**Result:** rollback is instant (just repoint).

---

## 3) Data inputs (Supabase queries)

### 3.1 FDC foods

You need:

* `fdc_id` (int)
* `description` (text)
* `category` (text)

Example SQL (adapt to your schema names):

```sql
SELECT fdc_id, description, food_category
FROM foods
WHERE is_synthetic = FALSE;
```

### 3.2 Ingredient vocab

You need:

* `ingredient_key` (your normalized_name or canonical key)
* `ingredient_text` (representative text)
* `freq` (optional, for ordering/reporting)

Example:

```sql
SELECT normalized_name AS ingredient_key,
       display_name    AS ingredient_text,
       frequency       AS freq
FROM recipe_ingredient_vocab;
```

(Or wherever your “ingredient lexicon” lives.)

### 3.3 Synonyms and category expectations

Two deterministic lexicons:

* `ingredient_synonyms(ingredient_key, synonym_text)`
* `ingredient_category_expectations(token_or_key, expected_category)`

  * You can implement expectations keyed by token (“oil”) or by ingredient_key.

If you don’t have these tables, store as versioned JSON in repo and load from disk (still deterministic).

---

## 4) Preprocessing pipeline (Python)

### 4.1 FDC preprocessing (one-time per run)

For each FDC row (C):

* `raw_description`
* `segments = description.split(",")`
* `tokens_raw = tokenize(raw_description)`
* `tokens_primary = tokenize(segments[0])`
* `tokens_rest = union(tokenize(segments[1:]))`
* `inverted_name = resolve_inverted_name(segments, category, domain_sets)`
* `candidate_strings_for_jw = [raw_description_norm, inverted_name_norm, segment_joined_norm]`

Store all of this in memory for fast scoring.

### 4.2 DF/IDF weights (one-time per run)

Compute `df(token)` across all FDC candidates using `tokens_raw`.

Weight function:
[
w(t)=\frac{1}{\log(2+df(t))}
]

Store `weight_by_token` dict.

### 4.3 Ingredient preprocessing

For each ingredient (I):

* `ingredient_norm = pre_normalize(ingredient_text)`
* `tokens_I = tokenize(ingredient_norm)` (unique, sorted)
* `synonym_sets = [tokenize(s) for s in synonyms[I]]`
* `expected_categories = expectations(tokens_I or ingredient_key)`

---

## 5) Scoring math (unchanged, now as Python contract)

For each ingredient (I) and candidate (C):

### 5.1 Directional weighted overlap

[
Overlap(I,C)=\frac{\sum_{t\in T_I\cap T_C} w(t)}{\sum_{t\in T_I} w(t)}
]
(if denominator 0 → 0)

### 5.2 Jaro-Winkler max with gating

[
JWmax=\max(JW(I,raw), JW(I,inverted), JW(I,segjoin))
]

Gate:

* if `Overlap < 0.40` then `JWgated = min(JWmax, 0.20)`
* else `JWgated = JWmax`

### 5.3 Segment score buckets

* if overlap with primary ≥ 0.60 → 1.0
* else if overlap with rest ≥ 0.60 → 0.6
* else if either ≥ 0.30 → 0.3
* else → 0.0

### 5.4 Category affinity

Deterministic expectation set (E(I)):

* unknown expectation → 0.0 (neutral)
* exact category in expected → 1.0
* compatible supergroup (optional) → 0.5
* mismatch → 0.0

### 5.5 Synonym confirmation gated by overlap

* `SynRaw = 1` if any synonym token-set is subset of candidate tokens, else 0
* `Syn = SynRaw if Overlap > 0 else 0`

### 5.6 Composite

[
Score=0.35Overlap+0.25JWgated+0.20Seg+0.10Aff+0.10Syn
]

### 5.7 Threshold status

* `mapped` ≥ 0.80
* `needs_review` 0.40–0.79
* `no_match` < 0.40

Near-ties:

* include candidates with score ≥ best − 0.05

---

## 6) Output artifacts written to Supabase

### Required rows (winner)

For each ingredient_key:

* `ingredient_key`
* `fdc_id` (nullable if no_match)
* `score`
* `status`
* `reason_codes[]` (derived deterministically from breakdown)
* `run_id`
* timestamps

### Optional rows

* near ties table (for audit)
* breakdown JSON table

**Strong recommendation:** persist breakdown JSON at least for `needs_review` and `mapped` winners. It’s priceless for debugging and drift control.

---

## 7) CLI contract (Python)

`python scripts/map_recipe_ingredients_v2.py [flags]`

Flags:

* `--write` (default: dry-run)
* `--run-id <uuid>` (optional; otherwise generate)
* `--limit-ingredients N`
* `--ingredient-key <key>` (debug single)
* `--top N` (by freq)
* `--emit-breakdowns` (store breakdown JSON)
* `--emit-candidates` (store near ties)
* `--promote` (only if validations pass)
* `--validate-only` (run tripwires and distribution checks)

---

## 8) Validations before promotion (hard gates)

### 8.1 Tripwire suite (must pass)

Examples:

* “oil” must map to Fats & Oils oils; must not map to boiled/broiled foods
* “salt” must not match “asphalt”
* “corn” must not match “corner”
* “olive oil” must map to olive oil, not olives
* “olive” must map to olives, not oil
* “butter” must prefer Dairy over Baked Products “Cookies, butter”

### 8.2 Distribution sanity checks

On the full run:

* % mapped / needs_review / no_match within expected bands
* top collision clusters (high near-tie counts) are inspected
* staples (“oil/salt/sugar/flour/butter”) have expected categories

Only then:

* mark run `validated`
* `--promote` sets `lexical_mapping_current.current_run_id = run_id`

---

## 9) File layout (Python)

```
lexical_scorer/
  __init__.py
  config.py                 # weights, thresholds, stopwords, gates, compat map
  tokenize.py               # pre_normalize, tokenize, segments, parentheticals
  idf.py                    # df + weight_by_token
  invert_name.py            # resolve_inverted_name using exported domain sets
  jw.py                     # jaro_winkler implementation (pure)
  signals.py                # overlap, seg, affinity, synonym, jw gating
  breakdown.py              # ScoreBreakdown object builder + reason codes
  schema/
    score_breakdown.lexical_v2.json

scripts/
  map_recipe_ingredients_v2.py

tests/
  test_tripwires.py
  test_tokenize_boundaries.py
  test_jaro_winkler.py
  test_breakdown_invariants.py
```

---

## 10) Supabase connection + write mechanics (operational)

### 10.1 Env vars

* `DATABASE_URL` (Supabase Postgres connection string)
* `SUPABASE_DB_SSLMODE=require` (or embed in URL)
* `RUN_GIT_SHA` (optional)
* `MAPPING_SCHEMA` if you use non-public schema

### 10.2 Writing at scale

Preferred write approach:

1. Insert run row into `lexical_mapping_runs`
2. Bulk insert winners into staging table using:

   * `COPY` (fastest) or
   * `execute_values`/`executemany` batches
3. Bulk insert breakdown JSON (optional) in a separate table
4. Run validations SQL-side (counts, category stats)
5. Promote by updating pointer

Avoid:

* row-by-row REST inserts
* truncating before validation

---

## 11) What stays unchanged (your downstream)

* `aggregate-recipe-nutrients.ts` can stay unchanged if it reads mapping outputs
* API layer reads same tables; only filter by `current_run_id` (or swap tables)

**********

Below is a **working Python skeleton** (module layout + runnable CLI) wired to **Supabase Postgres via psycopg3**, with:

* deterministic preprocessing + scoring hooks
* a **run_id staging + promote pointer** workflow
* **COPY-based bulk inserts**
* tripwire + invariants stubs

It’s intentionally “thin but real”: you can paste this into your repo and fill in the remaining business logic incrementally without changing the architecture.

---

## 0) Install + env

```bash
pip install psycopg[binary] python-dotenv orjson
```

Env vars:

* `DATABASE_URL` (Supabase Postgres connection string)

  * should include `sslmode=require` (or add separately)
* optional:

  * `RUN_GIT_SHA`
  * `MAPPING_SCHEMA` (default `public`)

Example `DATABASE_URL`:

```
postgresql://postgres:<password>@<project-ref>.supabase.co:5432/postgres?sslmode=require
```

---

## 1) Repo layout

```
lexical_scorer/
  __init__.py
  config.py
  tokenize.py
  idf.py
  jw.py
  invert_name.py
  signals.py
  breakdown.py
  db.py
  schema.sql

scripts/
  map_recipe_ingredients_v2.py

tests/
  test_tripwires.py
```

---

## 2) SQL schema (run once) — `lexical_scorer/schema.sql`

```sql
-- Run tracking
create table if not exists public.lexical_mapping_runs (
  run_id uuid primary key,
  created_at timestamptz not null default now(),
  git_sha text,
  config_json jsonb not null,
  tokenizer_hash text not null,
  idf_hash text not null,
  status text not null check (status in ('staging','validated','promoted','failed')),
  notes text
);

-- Current pointer
create table if not exists public.lexical_mapping_current (
  id boolean primary key default true,
  current_run_id uuid references public.lexical_mapping_runs(run_id),
  promoted_at timestamptz
);

insert into public.lexical_mapping_current(id) values (true)
on conflict (id) do nothing;

-- Winner mappings (compiled artifact)
create table if not exists public.canonical_fdc_membership (
  run_id uuid not null references public.lexical_mapping_runs(run_id),
  ingredient_key text not null,
  ingredient_text text not null,
  fdc_id int,
  score double precision not null,
  status text not null check (status in ('mapped','needs_review','no_match')),
  reason_codes text[] not null default '{}',
  candidate_description text,
  candidate_category text,
  created_at timestamptz not null default now(),
  primary key (run_id, ingredient_key)
);

-- Optional: store breakdown JSON for audit/debug
create table if not exists public.canonical_fdc_membership_breakdowns (
  run_id uuid not null references public.lexical_mapping_runs(run_id),
  ingredient_key text not null,
  fdc_id int,
  breakdown_json jsonb not null,
  created_at timestamptz not null default now(),
  primary key (run_id, ingredient_key)
);

-- Optional: near ties
create table if not exists public.canonical_fdc_membership_candidates (
  run_id uuid not null references public.lexical_mapping_runs(run_id),
  ingredient_key text not null,
  fdc_id int not null,
  score double precision not null,
  rank int not null,
  primary key (run_id, ingredient_key, fdc_id)
);

create index if not exists idx_cfm_run_status on public.canonical_fdc_membership(run_id, status);
```

---

## 3) DB connector + COPY helpers — `lexical_scorer/db.py`

```python
from __future__ import annotations

import os
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Iterable, Iterator, Optional, Sequence

import psycopg
from psycopg import Connection
from psycopg.rows import dict_row


@dataclass(frozen=True)
class DbConfig:
    dsn: str
    schema: str = "public"


def load_db_config() -> DbConfig:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL is required")
    schema = os.environ.get("MAPPING_SCHEMA", "public")
    return DbConfig(dsn=dsn, schema=schema)


@contextmanager
def connect(cfg: DbConfig) -> Iterator[Connection]:
    # autocommit off for safety; caller controls commit/rollback
    with psycopg.connect(cfg.dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(f"set search_path to {cfg.schema}, public;")
        yield conn


def fetchall(conn: Connection, sql: str, args: Optional[Sequence] = None) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(sql, args or ())
        return cur.fetchall()


def copy_insert_rows(
    conn: Connection,
    table: str,
    columns: list[str],
    rows: Iterable[Sequence],
) -> None:
    """
    Fast bulk insert using COPY FROM STDIN (text format).
    rows must yield sequences aligned with columns.
    """
    collist = ", ".join(columns)
    sql = f"COPY {table} ({collist}) FROM STDIN"
    with conn.cursor() as cur:
        with cur.copy(sql) as copy:
            for row in rows:
                copy.write_row(row)
```

---

## 4) Config + hashing — `lexical_scorer/config.py`

```python
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, asdict
from typing import Dict, List, Set


@dataclass(frozen=True)
class Weights:
    token_overlap: float = 0.35
    jaro_winkler: float = 0.25
    segment_match: float = 0.20
    category_affinity: float = 0.10
    synonym_confirmation: float = 0.10


@dataclass(frozen=True)
class Thresholds:
    mapped_min: float = 0.80
    needs_review_min: float = 0.40
    near_tie_delta: float = 0.05


@dataclass(frozen=True)
class JwGate:
    overlap_threshold: float = 0.40
    cap_value: float = 0.20


@dataclass(frozen=True)
class SegmentParams:
    primary_strong_min: float = 0.60
    rest_strong_min: float = 0.60
    partial_min: float = 0.30
    score_primary_strong: float = 1.0
    score_rest_strong: float = 0.6
    score_partial: float = 0.3


@dataclass(frozen=True)
class Config:
    version: str = "lexical_v2"
    weights: Weights = Weights()
    thresholds: Thresholds = Thresholds()
    jw_gate: JwGate = JwGate()
    segment: SegmentParams = SegmentParams()

    # stopwords for core tokenization
    stop_words: Set[str] = frozenset({
        "or","and","of","the","with","without","not","ns","nfs","a","an","in","for",
    })

    # optional: state tokens separated if you later add a state-bonus channel
    state_words: Set[str] = frozenset({
        "raw","cooked","boiled","broiled","roasted","fried","baked","grilled","steamed"
    })

    # ingredient token/category expectations (placeholder)
    expected_categories_by_token: Dict[str, List[str]] = None  # fill at runtime

    def to_json(self) -> dict:
        d = asdict(self)
        # sets are not JSON-serializable; normalize
        d["stop_words"] = sorted(list(self.stop_words))
        d["state_words"] = sorted(list(self.state_words))
        return d


def stable_hash(obj: object) -> str:
    s = json.dumps(obj, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(s).hexdigest()
```

---

## 5) Tokenization (boundary-safe via tokens) — `lexical_scorer/tokenize.py`

```python
from __future__ import annotations

import re
from typing import Iterable, List, Set

_NON_ALNUM = re.compile(r"[^a-z0-9]+", re.IGNORECASE)
_PARENS = re.compile(r"\(([^)]+)\)")


def pre_normalize(text: str) -> str:
    """
    Place-holder for your existing normalization rules:
    - "X, juice of" -> "X juice"
    - strip CSV artifacts
    Keep deterministic and minimal.
    """
    t = text.strip()
    t = re.sub(r"\s+", " ", t)
    return t


def tokenize(text: str, stop_words: Set[str]) -> List[str]:
    t = text.lower().strip()
    t = _NON_ALNUM.sub(" ", t)
    parts = [p for p in t.split() if p and p not in stop_words]
    # unique + stable sort
    return sorted(set(parts))


def split_segments(description: str) -> List[str]:
    return [seg.strip().lower() for seg in description.split(",") if seg.strip()]


def extract_parentheticals(description: str) -> List[str]:
    return [m.group(1).strip().lower() for m in _PARENS.finditer(description or "")]
```

---

## 6) IDF weights — `lexical_scorer/idf.py`

```python
from __future__ import annotations

import math
from collections import Counter
from typing import Dict, Iterable, List, Set


def compute_df(token_sets: Iterable[Set[str]]) -> Dict[str, int]:
    df = Counter()
    for s in token_sets:
        for tok in s:
            df[tok] += 1
    return dict(df)


def compute_idf_weights(df: Dict[str, int]) -> Dict[str, float]:
    """
    w(t) = 1 / log(2 + df(t))
    Deterministic; df>=1 for present tokens.
    """
    weights: Dict[str, float] = {}
    for tok, d in df.items():
        weights[tok] = 1.0 / math.log(2.0 + float(d))
    return weights
```

---

## 7) Jaro–Winkler — `lexical_scorer/jw.py`

This is a correct, standard implementation skeleton. (You can later swap with a vetted library if you want, but this keeps it pure and deterministic.)

```python
from __future__ import annotations

from math import floor


def jaro_winkler(a: str, b: str, prefix_scale: float = 0.1, max_prefix: int = 4) -> float:
    a = a or ""
    b = b or ""
    if a == b:
        return 1.0
    la, lb = len(a), len(b)
    if la == 0 or lb == 0:
        return 0.0

    match_dist = max(0, floor(max(la, lb) / 2) - 1)

    a_matches = [False] * la
    b_matches = [False] * lb

    matches = 0
    for i in range(la):
        start = max(0, i - match_dist)
        end = min(i + match_dist + 1, lb)
        for j in range(start, end):
            if b_matches[j]:
                continue
            if a[i] != b[j]:
                continue
            a_matches[i] = True
            b_matches[j] = True
            matches += 1
            break

    if matches == 0:
        return 0.0

    # transpositions
    k = 0
    transpositions = 0
    for i in range(la):
        if not a_matches[i]:
            continue
        while not b_matches[k]:
            k += 1
        if a[i] != b[k]:
            transpositions += 1
        k += 1
    transpositions /= 2

    m = float(matches)
    jaro = (m / la + m / lb + (m - transpositions) / m) / 3.0

    # winkler prefix
    prefix = 0
    for i in range(min(max_prefix, la, lb)):
        if a[i] == b[i]:
            prefix += 1
        else:
            break

    return jaro + prefix * prefix_scale * (1.0 - jaro)
```

---

## 8) Inverted name resolver stub — `lexical_scorer/invert_name.py`

```python
from __future__ import annotations

from typing import List, Optional


def resolve_inverted_name(segments: List[str], category: str) -> Optional[str]:
    """
    Stub: implement your USDA inversion using exported domain sets.
    Keep deterministic; return a human-order name like 'olive oil' from 'Oil, olive'.

    For now, implement a simple heuristic:
      if 2 segments and first is container-ish: return f"{seg1} {seg0}"
    Replace with your canonicalize.ts domain knowledge port.
    """
    if not segments:
        return None
    if len(segments) >= 2:
        seg0 = segments[0].strip()
        seg1 = segments[1].strip()
        # extremely minimal placeholder
        if seg0 in {"oil", "spices", "pepper", "sauce"}:
            return f"{seg1} {seg0}"
    return None
```

---

## 9) Signals + composite score — `lexical_scorer/signals.py`

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Set, Tuple

from .jw import jaro_winkler


@dataclass(frozen=True)
class OverlapDetail:
    overlap: float
    ingredient_total_weight: float
    intersection_weight: float
    intersection_tokens: Tuple[str, ...]


def weighted_overlap(
    tokens_i: Sequence[str],
    tokens_c: Set[str],
    weights: Dict[str, float],
) -> OverlapDetail:
    ti = list(tokens_i)
    if not ti:
        return OverlapDetail(overlap=0.0, ingredient_total_weight=0.0, intersection_weight=0.0, intersection_tokens=())

    total = 0.0
    inter = 0.0
    inter_tokens: List[str] = []
    for t in ti:
        w = weights.get(t, 0.0)
        total += w
        if t in tokens_c:
            inter += w
            inter_tokens.append(t)

    overlap = (inter / total) if total > 0 else 0.0
    return OverlapDetail(overlap=overlap, ingredient_total_weight=total, intersection_weight=inter, intersection_tokens=tuple(sorted(inter_tokens)))


def jw_max_gated(
    ingredient_str: str,
    candidate_strings: Sequence[str],
    overlap: float,
    gate_overlap_threshold: float,
    cap_value: float,
) -> tuple[float, float, bool]:
    """
    returns (jw_max, jw_capped, cap_applied)
    """
    vals = [jaro_winkler(ingredient_str, s) for s in candidate_strings if s]
    jw_max = max(vals) if vals else 0.0
    if overlap < gate_overlap_threshold:
        return jw_max, min(jw_max, cap_value), True
    return jw_max, jw_max, False


def segment_score_bucket(
    overlap_primary: float,
    overlap_rest: float,
    primary_strong_min: float,
    rest_strong_min: float,
    partial_min: float,
    score_primary_strong: float,
    score_rest_strong: float,
    score_partial: float,
) -> float:
    if overlap_primary >= primary_strong_min:
        return score_primary_strong
    if overlap_rest >= rest_strong_min:
        return score_rest_strong
    if overlap_primary >= partial_min or overlap_rest >= partial_min:
        return score_partial
    return 0.0


def category_affinity_score(
    expected_categories: Optional[Sequence[str]],
    candidate_category: str,
    compatible_categories: Optional[Sequence[str]] = None,
    score_exact: float = 1.0,
    score_compatible: float = 0.5,
    score_mismatch: float = 0.0,
    score_unknown: float = 0.0,
) -> tuple[float, str]:
    if not expected_categories:
        return score_unknown, "unknown"
    if candidate_category in expected_categories:
        return score_exact, "exact"
    if compatible_categories and candidate_category in compatible_categories:
        return score_compatible, "compatible"
    return score_mismatch, "mismatch"


def synonym_confirmation(
    synonym_sets: Sequence[Sequence[str]],
    candidate_tokens: Set[str],
    overlap: float,
    gate_requires_overlap_gt: float = 0.0,
) -> tuple[int, Optional[int], Optional[Tuple[str, ...]]]:
    """
    returns (synconf_gated 0/1, satisfied_index, satisfied_tokens)
    """
    sat_idx = None
    sat_tokens = None
    syn_raw = 0
    for i, syn in enumerate(synonym_sets):
        if syn and all(t in candidate_tokens for t in syn):
            syn_raw = 1
            sat_idx = i
            sat_tokens = tuple(syn)
            break

    syn_gated = syn_raw if overlap > gate_requires_overlap_gt else 0
    return syn_gated, sat_idx, sat_tokens
```

---

## 10) ScoreBreakdown builder — `lexical_scorer/breakdown.py`

This matches the “breakdown object” concept (not exhaustively filled yet, but the shape is right and deterministic). It’s JSON-serializable.

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from .config import Config
from .signals import (
    weighted_overlap,
    jw_max_gated,
    segment_score_bucket,
    category_affinity_score,
    synonym_confirmation,
)


def derive_reason_codes(
    token_overlap: float,
    jw_capped: float,
    jw_cap_applied: bool,
    seg_score: float,
    cat_kind: str,
    syn: int,
    composite: float,
    cfg: Config,
) -> List[str]:
    codes: List[str] = []

    if token_overlap >= 0.85:
        codes.append("token_overlap:high")
    elif token_overlap >= 0.60:
        codes.append("token_overlap:medium")
    elif token_overlap > 0:
        codes.append("token_overlap:low")
    else:
        codes.append("token_overlap:none")

    if jw_cap_applied:
        codes.append("jw:gated")
    elif jw_capped >= 0.92:
        codes.append("jw:high")
    elif jw_capped >= 0.80:
        codes.append("jw:medium")
    else:
        codes.append("jw:low")

    if seg_score == 1.0:
        codes.append("segment:primary_strong")
    elif seg_score == 0.6:
        codes.append("segment:rest_strong")
    elif seg_score == 0.3:
        codes.append("segment:partial")
    else:
        codes.append("segment:none")

    codes.append(f"category:{cat_kind}")
    if syn == 1:
        codes.append("synonym:confirmed")

    if composite >= cfg.thresholds.mapped_min:
        codes.append("status:mapped")
    elif composite >= cfg.thresholds.needs_review_min:
        codes.append("status:needs_review")
    else:
        codes.append("status:no_match")

    return sorted(set(codes))


def status_from_score(score: float, cfg: Config) -> str:
    if score >= cfg.thresholds.mapped_min:
        return "mapped"
    if score >= cfg.thresholds.needs_review_min:
        return "needs_review"
    return "no_match"


def compute_score_breakdown(
    *,
    cfg: Config,
    ingredient_key: str,
    ingredient_text: str,
    ingredient_norm: str,
    tokens_i: Sequence[str],
    synonym_sets: Sequence[Sequence[str]],
    expected_categories: Optional[Sequence[str]],
    weights_by_token: Dict[str, float],
    # candidate inputs (precomputed)
    candidate_fdc_id: int,
    candidate_description: str,
    candidate_category: str,
    candidate_tokens_raw: Set[str],
    candidate_tokens_primary: Set[str],
    candidate_tokens_rest: Set[str],
    candidate_strings_for_jw: Sequence[str],
) -> Dict[str, Any]:
    # A) token overlap against raw description tokens
    o_detail = weighted_overlap(tokens_i, candidate_tokens_raw, weights_by_token)
    o = o_detail.overlap

    # B) JW max + gate
    jw_max, jw_capped, jw_cap_applied = jw_max_gated(
        ingredient_norm,
        candidate_strings_for_jw,
        overlap=o,
        gate_overlap_threshold=cfg.jw_gate.overlap_threshold,
        cap_value=cfg.jw_gate.cap_value,
    )

    # C) segment overlaps use same overlap function but against primary/rest token sets
    o_primary = weighted_overlap(tokens_i, candidate_tokens_primary, weights_by_token).overlap
    o_rest = weighted_overlap(tokens_i, candidate_tokens_rest, weights_by_token).overlap

    seg_score = segment_score_bucket(
        overlap_primary=o_primary,
        overlap_rest=o_rest,
        primary_strong_min=cfg.segment.primary_strong_min,
        rest_strong_min=cfg.segment.rest_strong_min,
        partial_min=cfg.segment.partial_min,
        score_primary_strong=cfg.segment.score_primary_strong,
        score_rest_strong=cfg.segment.score_rest_strong,
        score_partial=cfg.segment.score_partial,
    )

    # D) category affinity
    aff_score, aff_kind = category_affinity_score(
        expected_categories=expected_categories,
        candidate_category=candidate_category,
        compatible_categories=None,  # plug in compat map if you add it
    )

    # E) synonym confirmation (gated by overlap>0)
    syn_gated, sat_idx, sat_tokens = synonym_confirmation(
        synonym_sets=synonym_sets,
        candidate_tokens=candidate_tokens_raw,
        overlap=o,
        gate_requires_overlap_gt=0.0,
    )

    # Composite
    w = cfg.weights
    contrib = {
        "token_overlap": w.token_overlap * o,
        "jaro_winkler": w.jaro_winkler * jw_capped,
        "segment_match": w.segment_match * seg_score,
        "category_affinity": w.category_affinity * aff_score,
        "synonym_confirmation": w.synonym_confirmation * float(syn_gated),
    }
    composite = sum(contrib.values())
    status = status_from_score(composite, cfg)

    reasons = derive_reason_codes(
        token_overlap=o,
        jw_capped=jw_capped,
        jw_cap_applied=jw_cap_applied,
        seg_score=seg_score,
        cat_kind=aff_kind,
        syn=syn_gated,
        composite=composite,
        cfg=cfg,
    )

    # Breakdown JSON (audit object)
    return {
        "version": cfg.version,
        "ingredient_id": ingredient_key,
        "ingredient_text": ingredient_text,
        "candidate_fdc_id": candidate_fdc_id,
        "candidate_description": candidate_description,
        "candidate_category": candidate_category,
        "weights": cfg.weights.__dict__,
        "thresholds": cfg.thresholds.__dict__,
        "signal_scores": {
            "token_overlap": o,
            "jaro_winkler": jw_capped,
            "segment_match": seg_score,
            "category_affinity": aff_score,
            "synonym_confirmation": syn_gated,
        },
        "weighted_contributions": contrib,
        "composite_score": composite,
        "status": status,
        "reasons": {"codes": reasons},
        "token_overlap_detail": {
            "ingredient_tokens": list(tokens_i),
            "intersection_tokens": list(o_detail.intersection_tokens),
            "intersection_weight": o_detail.intersection_weight,
            "ingredient_total_weight": o_detail.ingredient_total_weight,
            "overlap_directional": o,
        },
        "jaro_winkler_detail": {
            "ingredient_string": ingredient_norm,
            "candidate_raw": candidate_description.lower(),
            "jw_max": jw_max,
            "jw_cap_applied": jw_cap_applied,
            "jw_capped": jw_capped,
            "cap_value": cfg.jw_gate.cap_value,
            "gate_overlap_threshold": cfg.jw_gate.overlap_threshold,
            "token_overlap_for_gate": o,
        },
        "segment_match_detail": {
            "overlap_primary": o_primary,
            "overlap_rest": o_rest,
            "segment_score": seg_score,
            "primary_strong_min": cfg.segment.primary_strong_min,
            "rest_strong_min": cfg.segment.rest_strong_min,
            "partial_min": cfg.segment.partial_min,
            "score_primary_strong": cfg.segment.score_primary_strong,
            "score_rest_strong": cfg.segment.score_rest_strong,
            "score_partial": cfg.segment.score_partial,
        },
        "category_affinity_detail": {
            "ingredient_expected_categories": list(expected_categories) if expected_categories else None,
            "candidate_category": candidate_category,
            "affinity_score": aff_score,
            "matched_kind": aff_kind,
        },
        "synonym_confirmation_detail": {
            "synonym_sets": [list(s) for s in synonym_sets],
            "satisfied_index": sat_idx,
            "satisfied_tokens": list(sat_tokens) if sat_tokens else None,
            "synconf_gated": syn_gated,
        },
    }
```

---

## 11) Orchestrator CLI — `scripts/map_recipe_ingredients_v2.py`

This is the piece that:

* reads from Supabase Postgres
* builds precomputed FDC candidate cache
* computes IDF weights
* scores all candidates for each ingredient
* writes outputs via COPY
* optionally promotes run_id

```python
from __future__ import annotations

import argparse
import os
import sys
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

import orjson

from lexical_scorer.config import Config, stable_hash
from lexical_scorer.db import connect, copy_insert_rows, fetchall, load_db_config
from lexical_scorer.idf import compute_df, compute_idf_weights
from lexical_scorer.invert_name import resolve_inverted_name
from lexical_scorer.tokenize import pre_normalize, tokenize, split_segments
from lexical_scorer.breakdown import compute_score_breakdown


@dataclass(frozen=True)
class FdcCandidate:
    fdc_id: int
    description: str
    category: str
    tokens_raw: Set[str]
    tokens_primary: Set[str]
    tokens_rest: Set[str]
    jw_strings: Tuple[str, ...]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--write", action="store_true", help="Write staged outputs to DB")
    p.add_argument("--emit-breakdowns", action="store_true", help="Write breakdown JSON per winner")
    p.add_argument("--emit-candidates", action="store_true", help="Write near ties table")
    p.add_argument("--promote", action="store_true", help="Promote run_id to current pointer (requires --write)")
    p.add_argument("--limit-ingredients", type=int, default=None)
    p.add_argument("--ingredient-key", type=str, default=None)
    p.add_argument("--top", type=int, default=None, help="Limit to top N ingredients by freq (requires vocab query provides freq)")
    p.add_argument("--run-id", type=str, default=None)
    return p.parse_args()


def load_fdc_candidates(conn, cfg: Config) -> List[FdcCandidate]:
    rows = fetchall(conn, """
        select fdc_id, description, food_category as category
        from foods
        where is_synthetic = false
    """)
    out: List[FdcCandidate] = []
    for r in rows:
        desc = (r["description"] or "").strip()
        cat = (r["category"] or "").strip()
        segs = split_segments(desc)
        inv = resolve_inverted_name(segs, cat) or ""
        seg_join = ", ".join(segs)

        tokens_raw = set(tokenize(desc, cfg.stop_words))
        tokens_primary = set(tokenize(segs[0], cfg.stop_words)) if segs else set()
        rest_tokens: Set[str] = set()
        for s in segs[1:]:
            rest_tokens.update(tokenize(s, cfg.stop_words))

        jw_strings = tuple(s.lower() for s in [desc, inv, seg_join] if s)
        out.append(FdcCandidate(
            fdc_id=int(r["fdc_id"]),
            description=desc,
            category=cat,
            tokens_raw=tokens_raw,
            tokens_primary=tokens_primary,
            tokens_rest=rest_tokens,
            jw_strings=jw_strings,
        ))
    return out


def load_ingredient_vocab(conn, limit: Optional[int], key: Optional[str], top: Optional[int]) -> List[dict]:
    # Adjust this query to your actual vocab table/columns.
    # Must return ingredient_key, ingredient_text, freq (optional).
    base = """
        select normalized_name as ingredient_key,
               coalesce(display_name, normalized_name) as ingredient_text,
               coalesce(frequency, 0) as freq
        from recipe_ingredient_vocab
    """
    where = []
    args: List[Any] = []
    if key:
        where.append("normalized_name = %s")
        args.append(key)
    order = " order by freq desc " if top is not None else ""
    lim = ""
    if top is not None:
        lim = " limit %s"
        args.append(int(top))
    elif limit is not None:
        lim = " limit %s"
        args.append(int(limit))

    sql = base + (" where " + " and ".join(where) if where else "") + order + lim
    return fetchall(conn, sql, args)


def expected_categories_for(tokens_i: Sequence[str], cfg: Config) -> Optional[List[str]]:
    # Minimal deterministic expectation mapping keyed by token.
    # Replace with your lexicon. Neutral if unknown.
    if not cfg.expected_categories_by_token:
        return None
    expected: Set[str] = set()
    for t in tokens_i:
        cats = cfg.expected_categories_by_token.get(t)
        if cats:
            expected.update(cats)
    return sorted(expected) if expected else None


def synonym_sets_for(_ingredient_key: str) -> List[List[str]]:
    # Stub: load from DB or JSON
    return []


def pick_best_and_near_ties(
    scored: List[Tuple[FdcCandidate, Dict[str, Any]]],
    near_delta: float,
) -> Tuple[FdcCandidate, Dict[str, Any], List[Tuple[FdcCandidate, float]]]:
    scored.sort(key=lambda x: x[1]["composite_score"], reverse=True)
    best_c, best_b = scored[0]
    best_s = float(best_b["composite_score"])
    near: List[Tuple[FdcCandidate, float]] = []
    cutoff = best_s - near_delta
    for c, b in scored:
        s = float(b["composite_score"])
        if s >= cutoff:
            near.append((c, s))
        else:
            break
    return best_c, best_b, near


def main() -> int:
    args = parse_args()
    cfg = Config()

    # Example expectations (replace with your real lexicon)
    cfg = Config(expected_categories_by_token={
        "oil": ["Fats and Oils"],
        "butter": ["Dairy and Egg Products"],
        "sugar": ["Sweets"],
    })

    run_id = uuid.UUID(args.run_id) if args.run_id else uuid.uuid4()
    git_sha = os.environ.get("RUN_GIT_SHA")

    db_cfg = load_db_config()

    with connect(db_cfg) as conn:
        # --- load candidates
        fdc_candidates = load_fdc_candidates(conn, cfg)

        # --- build DF/IDF weights on raw candidate tokens
        df = compute_df([c.tokens_raw for c in fdc_candidates])
        weights_by_token = compute_idf_weights(df)

        tokenizer_hash = stable_hash({
            "stop_words": sorted(list(cfg.stop_words)),
            "rules": "NON_ALNUM split + lowercase + unique/sorted",
        })
        idf_hash = stable_hash({"df": df})  # can be big; you may prefer hashing the weights dict instead

        # --- insert run record
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into lexical_mapping_runs(run_id, git_sha, config_json, tokenizer_hash, idf_hash, status)
                values (%s, %s, %s::jsonb, %s, %s, 'staging')
                on conflict (run_id) do nothing
                """,
                (
                    str(run_id),
                    git_sha,
                    orjson.dumps(cfg.to_json()).decode("utf-8"),
                    tokenizer_hash,
                    idf_hash,
                ),
            )
        conn.commit()

        # --- load ingredients
        ing_rows = load_ingredient_vocab(conn, args.limit_ingredients, args.ingredient_key, args.top)
        if not ing_rows:
            print("No ingredients found.")
            return 1

        # --- compute winner rows and optional breakdowns / candidates
        winner_rows: List[Tuple] = []
        breakdown_rows: List[Tuple] = []
        candidate_rows: List[Tuple] = []

        for ing in ing_rows:
            ingredient_key = ing["ingredient_key"]
            ingredient_text = ing["ingredient_text"]

            ingredient_norm = pre_normalize(ingredient_text)
            tokens_i = tokenize(ingredient_norm, cfg.stop_words)

            expected_cats = expected_categories_for(tokens_i, cfg)
            syn_sets = [tokenize(s, cfg.stop_words) for s in []]  # stub; replace

            scored: List[Tuple[FdcCandidate, Dict[str, Any]]] = []
            for cand in fdc_candidates:
                b = compute_score_breakdown(
                    cfg=cfg,
                    ingredient_key=ingredient_key,
                    ingredient_text=ingredient_text,
                    ingredient_norm=ingredient_norm.lower(),
                    tokens_i=tokens_i,
                    synonym_sets=syn_sets,
                    expected_categories=expected_cats,
                    weights_by_token=weights_by_token,
                    candidate_fdc_id=cand.fdc_id,
                    candidate_description=cand.description,
                    candidate_category=cand.category,
                    candidate_tokens_raw=cand.tokens_raw,
                    candidate_tokens_primary=cand.tokens_primary,
                    candidate_tokens_rest=cand.tokens_rest,
                    candidate_strings_for_jw=cand.jw_strings,
                )
                scored.append((cand, b))

            best_c, best_b, near = pick_best_and_near_ties(scored, cfg.thresholds.near_tie_delta)

            status = best_b["status"]
            score = float(best_b["composite_score"])

            # If no_match, store null fdc_id
            fdc_id_out = best_c.fdc_id if status != "no_match" else None

            winner_rows.append((
                str(run_id),
                ingredient_key,
                ingredient_text,
                fdc_id_out,
                score,
                status,
                best_b["reasons"]["codes"],
                best_c.description,
                best_c.category,
            ))

            if args.emit_breakdowns:
                breakdown_rows.append((
                    str(run_id),
                    ingredient_key,
                    fdc_id_out,
                    orjson.dumps(best_b).decode("utf-8"),
                ))

            if args.emit_candidates:
                # rank near ties by score desc
                near_sorted = sorted(near, key=lambda x: x[1], reverse=True)
                for rank, (cand, s) in enumerate(near_sorted, start=1):
                    candidate_rows.append((
                        str(run_id),
                        ingredient_key,
                        cand.fdc_id,
                        float(s),
                        rank,
                    ))

        # --- DRY RUN OUTPUT
        if not args.write:
            mapped = sum(1 for r in winner_rows if r[5] == "mapped")
            needs = sum(1 for r in winner_rows if r[5] == "needs_review")
            nom = sum(1 for r in winner_rows if r[5] == "no_match")
            print(f"DRY RUN run_id={run_id} winners={len(winner_rows)} mapped={mapped} needs_review={needs} no_match={nom}")
            return 0

        # --- WRITE STAGING (COPY)
        with connect(db_cfg) as conn2:
            # winners
            copy_insert_rows(
                conn2,
                table="canonical_fdc_membership",
                columns=[
                    "run_id","ingredient_key","ingredient_text","fdc_id","score","status",
                    "reason_codes","candidate_description","candidate_category"
                ],
                rows=winner_rows,
            )

            if args.emit_breakdowns and breakdown_rows:
                copy_insert_rows(
                    conn2,
                    table="canonical_fdc_membership_breakdowns",
                    columns=["run_id","ingredient_key","fdc_id","breakdown_json"],
                    rows=breakdown_rows,
                )

            if args.emit_candidates and candidate_rows:
                copy_insert_rows(
                    conn2,
                    table="canonical_fdc_membership_candidates",
                    columns=["run_id","ingredient_key","fdc_id","score","rank"],
                    rows=candidate_rows,
                )

            # mark validated (you should run tripwires + distribution checks first)
            with conn2.cursor() as cur:
                cur.execute(
                    "update lexical_mapping_runs set status='validated' where run_id=%s and status='staging'",
                    (str(run_id),),
                )

            # promote pointer
            if args.promote:
                with conn2.cursor() as cur:
                    cur.execute(
                        """
                        update lexical_mapping_current
                        set current_run_id=%s, promoted_at=now()
                        where id=true
                        """,
                        (str(run_id),),
                    )
                    cur.execute(
                        "update lexical_mapping_runs set status='promoted' where run_id=%s",
                        (str(run_id),),
                    )

            conn2.commit()

        print(f"WROTE run_id={run_id} (validated={True}) promoted={bool(args.promote)}")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

---

## 12) Minimal tripwire test — `tests/test_tripwires.py`

This is a placeholder demonstrating how you’d enforce “oil ≠ boiled” and category sanity once you wire real data fixtures.

```python
def test_tokenizer_boundary_oil_boiled():
    from lexical_scorer.tokenize import tokenize
    from lexical_scorer.config import Config

    cfg = Config()
    assert "oil" in tokenize("olive oil", cfg.stop_words)
    assert "boiled" in tokenize("boiled potatoes", cfg.stop_words)
    assert "oil" not in tokenize("boiled potatoes", cfg.stop_words)
```

---

## What you should fill next (in order)

1. **Replace `resolve_inverted_name()`** with your canonicalize.ts domain sets (ported or exported as JSON).
2. **Replace ingredient vocab query** with your real table/columns (the scaffold assumes `recipe_ingredient_vocab`).
3. Add **synonyms loader** (DB or JSON file), then feed `synonym_sets`.
4. Expand **expected categories lexicon** to cover staples and your top-frequency tokens.
5. Add **validation gates** before promoting:

   * tripwires (hard fail)
   * distribution sanity checks (hard fail)
6. Add optional **candidate pruning** (token→fdc index) once correctness is locked.
