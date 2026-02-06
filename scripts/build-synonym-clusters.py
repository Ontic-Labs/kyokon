#!/usr/bin/env python3
"""
Build synonym clusters from recipe ingredient corpus.

Approach:
1. Load ingredient frequencies from RAW_recipes.csv
2. Filter to actual ingredients (exclude instructions)
3. Tokenize and extract base terms vs form modifiers
4. Cluster by shared base + form
5. Output clusters with canonical (highest frequency) and aliases

Usage:
    python scripts/build-synonym-clusters.py
    python scripts/build-synonym-clusters.py --min-freq 10
"""

import csv
import json
import re
import ast
from collections import Counter, defaultdict
from pathlib import Path

# ---------------------------------------------------------------------------
# Form modifiers - differentiate variants of the same base ingredient
# ---------------------------------------------------------------------------
FORM_MODIFIERS = {
    # Processing state
    "powder", "powdered", "ground", "granulated", "granules", "flakes", "flaked",
    "minced", "chopped", "diced", "sliced", "shredded", "grated", "crushed",
    "whole", "halved", "quartered", "cubed", "mashed", "pureed",
    # Preservation
    "fresh", "dried", "dry", "frozen", "canned", "pickled", "smoked", "cured",
    "roasted", "toasted",
    # Preparation
    "raw", "cooked", "uncooked", "blanched", "peeled", "seeded", "pitted",
    "boneless", "skinless", "melted", "softened",
    # Size
    "large", "medium", "small", "baby", "mini", "jumbo", "thin", "thick",
    # Quality
    "organic", "natural", "pure", "real", "imitation", "low-fat", "nonfat",
    "unsalted", "salted", "sweetened", "unsweetened",
}

# Lemma mappings
LEMMAS = {
    "powdered": "powder",
    "granulated": "granules",
    "flaked": "flakes",
    "dried": "dry",
    "roasted": "roast",
    "toasted": "toast",
    "smoked": "smoke",
    "minced": "mince",
    "chopped": "chop",
    "diced": "dice",
    "sliced": "slice",
    "shredded": "shred",
    "grated": "grate",
    "crushed": "crush",
    "peeled": "peel",
    "seeded": "seed",
    "pitted": "pit",
    "halved": "half",
    "quartered": "quarter",
    "cubed": "cube",
    "mashed": "mash",
    "pureed": "puree",
    "cloves": "clove",
    "heads": "head",
    "bulbs": "bulb",
    "stalks": "stalk",
    "leaves": "leaf",
    "sprigs": "sprig",
    "bunches": "bunch",
    "ribs": "rib",
    "ears": "ear",
    "strips": "strip",
    "pieces": "piece",
}

# Unit words that indicate measurement, not identity
UNIT_WORDS = {
    "clove", "cloves", "head", "heads", "bulb", "bulbs", "stalk", "stalks",
    "leaf", "leaves", "sprig", "sprigs", "bunch", "bunches", "rib", "ribs",
    "ear", "ears", "strip", "strips", "piece", "pieces", "slice", "slices",
    "cup", "cups", "tablespoon", "tablespoons", "teaspoon", "teaspoons",
    "pound", "pounds", "ounce", "ounces", "can", "cans", "package", "packages",
}

def tokenize(text: str) -> list[str]:
    """Tokenize text into lowercase words."""
    return [t for t in re.sub(r"[^a-z0-9\s-]", " ", text.lower()).split() if len(t) >= 2]

def lemmatize(word: str) -> str:
    """Normalize word forms."""
    return LEMMAS.get(word, word)

def extract_base_and_form(ingredient: str) -> tuple[list[str], list[str]]:
    """Split ingredient into base tokens and form modifier tokens."""
    tokens = tokenize(ingredient)
    base = []
    form = []

    for t in tokens:
        lemma = lemmatize(t)
        if t in FORM_MODIFIERS or lemma in FORM_MODIFIERS:
            form.append(lemma)
        elif t not in UNIT_WORDS:
            base.append(t)

    return base, form

def make_cluster_key(base: list[str], form: list[str]) -> str:
    """Create a unique key for clustering."""
    base_key = "+".join(sorted(base)) if base else "_empty_"
    form_key = "+".join(sorted(form)) if form else "base"
    return f"{base_key}|{form_key}"

def load_ingredients(csv_path: str) -> Counter:
    """Load ingredient frequencies from RAW_recipes.csv."""
    freq = Counter()
    with open(csv_path, "r") as f:
        reader = csv.reader(f)
        next(reader)  # skip header
        for row in reader:
            if len(row) >= 11:
                try:
                    ingredients = ast.literal_eval(row[10])  # ingredients column
                    for ing in ingredients:
                        norm = ing.lower().strip()
                        if len(norm) > 1:
                            freq[norm] += 1
                except:
                    pass
    return freq

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-freq", type=int, default=5)
    args = parser.parse_args()

    print("=== Build Synonym Clusters ===\n")
    print(f"Minimum frequency: {args.min_freq}")

    # Load ingredients
    print("\nLoading ingredients...")
    freq = load_ingredients("data/RAW_recipes.csv")
    print(f"  Total unique: {len(freq)}")

    # Filter and cluster
    print("\nClustering...")
    clusters = defaultdict(list)  # key -> list of (ingredient, count, base, form)

    filtered_low = 0
    kept = 0

    for ing, count in freq.items():
        if count < args.min_freq:
            filtered_low += 1
            continue

        base, form = extract_base_and_form(ing)
        if not base:  # No base tokens (all modifiers/units)
            continue

        key = make_cluster_key(base, form)
        clusters[key].append({
            "name": ing,
            "count": count,
            "base": base,
            "form": form,
        })
        kept += 1

    print(f"  Low frequency filtered: {filtered_low}")
    print(f"  Kept: {kept}")
    print(f"  Clusters: {len(clusters)}")

    # Build output clusters
    output_clusters = []

    for key, members in clusters.items():
        # Sort by count descending
        members.sort(key=lambda x: -x["count"])
        canonical = members[0]

        # Only include clusters with multiple members OR high-frequency singles
        if len(members) == 1 and canonical["count"] < 50:
            continue

        cluster = {
            "canonical": canonical["name"],
            "count": canonical["count"],
            "base": canonical["base"],
            "form": "+".join(canonical["form"]) if canonical["form"] else "base",
            "aliases": [
                {"name": m["name"], "count": m["count"]}
                for m in members[1:] if m["count"] >= 5
            ],
            "totalUsage": sum(m["count"] for m in members),
        }

        if cluster["aliases"] or canonical["count"] >= 50:
            output_clusters.append(cluster)

    # Sort by total usage
    output_clusters.sort(key=lambda x: -x["totalUsage"])

    print(f"\nOutput clusters: {len(output_clusters)}")
    print(f"  With aliases: {sum(1 for c in output_clusters if c['aliases'])}")

    # Group by base ingredient for analysis
    base_groups = defaultdict(list)
    for cluster in output_clusters:
        base_key = "+".join(sorted(cluster["base"]))
        base_groups[base_key].append(cluster)

    print(f"  Unique base ingredients: {len(base_groups)}")

    # Output
    output = {
        "generated": "2026-02-05",
        "minFrequency": args.min_freq,
        "stats": {
            "totalClusters": len(output_clusters),
            "baseIngredients": len(base_groups),
            "withAliases": sum(1 for c in output_clusters if c["aliases"]),
        },
        "clusters": output_clusters,
    }

    out_path = Path("data/synonym-clusters.json")
    out_path.write_text(json.dumps(output, indent=2))
    print(f"\nWritten to {out_path}")

    # Show examples
    print("\n=== TOP 30 CLUSTERS ===\n")
    for cluster in output_clusters[:30]:
        alias_str = f" + {len(cluster['aliases'])} aliases" if cluster["aliases"] else ""
        print(f"[{cluster['totalUsage']:6}] {cluster['canonical']} ({cluster['form']}){alias_str}")
        for alias in cluster["aliases"][:3]:
            print(f"           └─ [{alias['count']}] {alias['name']}")
        if len(cluster["aliases"]) > 3:
            print(f"           └─ ... and {len(cluster['aliases']) - 3} more")

    # Show garlic example
    print("\n=== GARLIC CLUSTERS ===\n")
    garlic_clusters = [c for c in output_clusters if "garlic" in c["base"]]
    for cluster in garlic_clusters[:15]:
        alias_str = f" + {len(cluster['aliases'])} aliases" if cluster["aliases"] else ""
        print(f"[{cluster['totalUsage']:6}] {cluster['canonical']} ({cluster['form']}){alias_str}")
        for alias in cluster["aliases"][:3]:
            print(f"           └─ [{alias['count']}] {alias['name']}")

if __name__ == "__main__":
    main()
