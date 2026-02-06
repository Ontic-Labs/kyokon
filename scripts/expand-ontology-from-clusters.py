#!/usr/bin/env python3
"""
Expand ontology with unmatched clusters from recipe corpus.

For each unmatched cluster:
1. Try to match to FDC foods using the lexical scorer's approach
2. Create new ontology entries with best FDC match
3. Add aliases from cluster

Usage:
    python scripts/expand-ontology-from-clusters.py
    python scripts/expand-ontology-from-clusters.py --dry-run
    python scripts/expand-ontology-from-clusters.py --min-count 100
"""

import json
import re
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent

# Lemmas for normalization (same as in ontology cleanup)
LEMMAS = {
    "powdered": "powder", "granulated": "granule", "flaked": "flake",
    "dried": "dry", "roasted": "roast", "toasted": "toast", "smoked": "smoke",
    "minced": "mince", "chopped": "chop", "diced": "dice", "sliced": "slice",
    "shredded": "shred", "grated": "grate", "crushed": "crush", "peeled": "peel",
    "seeded": "seed", "pitted": "pit", "halved": "half", "quartered": "quarter",
    "cubed": "cube", "mashed": "mash", "pureed": "puree", "melted": "melt",
    "softened": "soften", "frozen": "freeze", "canned": "can", "pickled": "pickle",
    "cloves": "clove", "heads": "head", "bulbs": "bulb", "stalks": "stalk",
    "leaves": "leaf", "sprigs": "sprig", "bunches": "bunch", "ribs": "rib",
    "potatoes": "potato", "tomatoes": "tomato", "onions": "onion",
    "carrots": "carrot", "peppers": "pepper", "apples": "apple",
    "eggs": "egg", "breasts": "breast", "thighs": "thigh", "chops": "chop",
    "steaks": "steak", "berries": "berry", "cherries": "cherry",
    "strawberries": "strawberry", "blueberries": "blueberry", "beans": "bean",
    "peas": "pea", "nuts": "nut", "seeds": "seed", "flakes": "flake",
    "chips": "chip", "crumbs": "crumb", "noodles": "noodle", "tortillas": "tortilla",
    "olives": "olive", "mushrooms": "mushroom", "oranges": "orange",
    "lemons": "lemon", "limes": "lime",
}

def lemmatize(word: str) -> str:
    return LEMMAS.get(word, word)

def normalize_surface(text: str) -> str:
    """Lowercase and collapse whitespace for surface forms."""
    return " ".join(text.lower().strip().split())

def slugify(text: str) -> str:
    s = text.lower().strip()
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"[\s]+", "-", s)
    return s.strip("-")

def tokenize(text: str) -> set:
    """Extract tokens for matching."""
    return {lemmatize(t) for t in re.sub(r"[^a-z0-9\s]", " ", text.lower()).split() if len(t) >= 2}

def load_fdc_foods():
    """Load FDC foods from the staging data for matching."""
    # Use the synonym-gaps which has FDC candidates
    gaps = json.loads((ROOT / "data" / "synonym-gaps.json").read_text())

    # Build a map of ingredient -> best FDC candidate
    fdc_candidates = {}
    for item in gaps["needs_review"] + gaps["no_match"]:
        ing = item["ingredient"].lower()
        if item.get("bestCandidate"):
            fdc_candidates[ing] = {
                "description": item["bestCandidate"],
                "category": item.get("candidateCategory"),
                "score": float(item["score"]),
            }
    return fdc_candidates

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--min-count", type=int, default=50, help="Min recipe count to include")
    args = parser.parse_args()

    print("=== Expand Ontology from Clusters ===\n")

    # Load current ontology
    ontology_path = ROOT / "data" / "ingredient-ontology-v2.json"
    ontology = json.loads(ontology_path.read_text())
    print(f"Current ontology: {len(ontology)} entries")

    # Build existing slug/surface form index
    existing_slugs = {e["slug"] for e in ontology}
    existing_surfaces = set()
    for e in ontology:
        for sf in e.get("surfaceForms", []):
            existing_surfaces.add(sf.lower())

    # Load unmatched clusters
    clusters_path = ROOT / "data" / "unmatched-clusters.json"
    clusters_data = json.loads(clusters_path.read_text())
    clusters = clusters_data["clusters"]
    print(f"Unmatched clusters: {len(clusters)}")

    # Load FDC candidates from gaps
    fdc_candidates = load_fdc_foods()
    print(f"FDC candidates available: {len(fdc_candidates)}")

    # Filter by min count
    clusters = [c for c in clusters if c["count"] >= args.min_count]
    print(f"Clusters with count >= {args.min_count}: {len(clusters)}")

    # Process clusters
    new_entries = []
    skipped_existing = 0
    skipped_no_fdc = 0

    for cluster in clusters:
        canonical = cluster["canonical"]
        canonical_lower = canonical.lower()
        aliases = cluster.get("aliases", [])
        count = cluster["count"]

        # Skip if already in ontology
        slug = slugify(canonical)
        if slug in existing_slugs:
            skipped_existing += 1
            continue

        norm_canonical = normalize_surface(canonical)
        if norm_canonical in existing_surfaces:
            skipped_existing += 1
            continue

        # Try to find FDC match
        fdc_match = fdc_candidates.get(canonical_lower)

        # If no direct match, try aliases
        if not fdc_match:
            for alias in aliases:
                fdc_match = fdc_candidates.get(alias.lower())
                if fdc_match:
                    break

        # Build surface forms
        surface_forms = [normalize_surface(canonical)]
        seen = {surface_forms[0]}
        for alias in aliases:
            norm_alias = normalize_surface(alias)
            if norm_alias not in seen and norm_alias not in existing_surfaces:
                surface_forms.append(norm_alias)
                seen.add(norm_alias)

        # Create entry
        entry = {
            "slug": slug,
            "displayName": canonical.title(),
            "surfaceForms": surface_forms,
            "recipeCount": count,
        }

        if fdc_match:
            # We don't have the actual fdcId, but we have the candidate info
            # Mark it for review
            entry["fdcCandidate"] = {
                "description": fdc_match["description"],
                "category": fdc_match["category"],
                "matchScore": fdc_match["score"],
            }
        else:
            skipped_no_fdc += 1
            entry["fdcCandidate"] = None

        new_entries.append(entry)

    print(f"\nNew entries to add: {len(new_entries)}")
    print(f"Skipped (already exists): {skipped_existing}")
    print(f"Without FDC candidate: {skipped_no_fdc}")

    # Stats on new entries
    with_fdc = sum(1 for e in new_entries if e.get("fdcCandidate"))
    high_score = sum(1 for e in new_entries if e.get("fdcCandidate") and e["fdcCandidate"]["matchScore"] >= 0.5)

    print(f"New entries with FDC candidate: {with_fdc}")
    print(f"New entries with score >= 0.5: {high_score}")

    # Show samples
    print("\n=== SAMPLE NEW ENTRIES (top 20 by recipe count) ===")
    new_entries.sort(key=lambda x: -x["recipeCount"])
    for entry in new_entries[:20]:
        fdc_info = ""
        if entry.get("fdcCandidate"):
            fdc = entry["fdcCandidate"]
            fdc_info = f" → {fdc['description'][:40]}... ({fdc['matchScore']:.2f})"
        print(f"  [{entry['recipeCount']:5}] {entry['displayName']}{fdc_info}")
        if len(entry["surfaceForms"]) > 1:
            print(f"          aliases: {entry['surfaceForms'][1:4]}")

    if args.dry_run:
        print("\n[DRY RUN - no files written]")
    else:
        # Merge into ontology
        ontology.extend(new_entries)
        ontology.sort(key=lambda e: e["slug"])

        # Write
        content = json.dumps(ontology, indent=2, ensure_ascii=False)
        ontology_path.write_text(content)
        print(f"\nWritten {len(ontology)} entries to {ontology_path}")
        print(f"  New entries added: {len(new_entries)}")
        print(f"  Total surface forms: {sum(len(e.get('surfaceForms', [])) for e in ontology)}")

if __name__ == "__main__":
    main()
