#!/usr/bin/env python3
"""
Merge synonym clusters into ingredient ontology as unified ground truth.

Takes:
- data/synonym-clusters.json (recipe-derived clusters)
- data/ingredient-ontology.json (existing ontology with FDC mappings)
- src/lib/lexical-scorer.ts (SYNONYM_TABLE to migrate)

Produces:
- data/ingredient-ontology-v2.json (unified format)

New schema per entry:
{
  "slug": "ground-ginger",
  "displayName": "Ground Ginger",
  "surfaceForms": ["ground ginger", "ginger powder", "powdered ginger"],
  "confirmTokens": ["ginger", "ground"],  // NEW: for scorer confirmation
  "recipeCount": 10887,                    // NEW: usage frequency from corpus
  "fdc": { "fdcId": 171327, ... },
  "equivalenceClass": "ginger",
  ...
}

Usage:
    python scripts/merge-clusters-to-ontology.py
    python scripts/merge-clusters-to-ontology.py --dry-run
"""

import json
import re
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent

def slugify(text: str) -> str:
    """Convert text to slug."""
    s = text.lower().strip()
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"[\s]+", "-", s)
    s = re.sub(r"-+", "-", s)
    return s.strip("-")

def tokenize(text: str) -> list[str]:
    """Tokenize text into words."""
    return [t for t in re.sub(r"[^a-z0-9\s]", " ", text.lower()).split() if len(t) >= 2]

def extract_synonym_table(scorer_path: Path) -> dict[str, list[list[str]]]:
    """Extract SYNONYM_TABLE from lexical-scorer.ts."""
    content = scorer_path.read_text()

    # Find the SYNONYM_TABLE map
    match = re.search(
        r'export const SYNONYM_TABLE = new Map<string, string\[\]\[\]>\(\[\s*(.*?)\s*\]\);',
        content,
        re.DOTALL
    )
    if not match:
        print("Warning: Could not find SYNONYM_TABLE in lexical-scorer.ts")
        return {}

    table_content = match.group(1)

    # Parse entries: ["key", [["token1", "token2"], ["token3"]]]
    synonyms = {}
    # Match pattern: ["ingredient name", [[...], [...]]]
    entry_pattern = re.compile(
        r'\["([^"]+)",\s*\[((?:\[[^\]]*\](?:,\s*)?)+)\]\]',
        re.DOTALL
    )

    for m in entry_pattern.finditer(table_content):
        key = m.group(1)
        tokens_str = m.group(2)
        # Parse the token arrays
        token_arrays = []
        for arr_match in re.finditer(r'\[([^\]]*)\]', tokens_str):
            arr_content = arr_match.group(1)
            tokens = [t.strip().strip('"').strip("'") for t in arr_content.split(",") if t.strip()]
            if tokens:
                token_arrays.append(tokens)
        if token_arrays:
            synonyms[key] = token_arrays

    return synonyms

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print("=== Merge Clusters to Ontology ===\n")

    # Load existing ontology
    ontology_path = ROOT / "data" / "ingredient-ontology.json"
    ontology = json.loads(ontology_path.read_text())
    print(f"Existing ontology: {len(ontology)} entries")

    # Build slug index
    slug_to_entry = {e["slug"]: e for e in ontology}
    surface_to_slug = {}
    for e in ontology:
        for sf in e.get("surfaceForms", []):
            surface_to_slug[sf.lower()] = e["slug"]

    # Load synonym clusters
    clusters_path = ROOT / "data" / "synonym-clusters.json"
    clusters_data = json.loads(clusters_path.read_text())
    clusters = clusters_data["clusters"]
    print(f"Synonym clusters: {len(clusters)}")

    # Load SYNONYM_TABLE from scorer
    scorer_path = ROOT / "src" / "lib" / "lexical-scorer.ts"
    synonym_table = extract_synonym_table(scorer_path)
    print(f"SYNONYM_TABLE entries: {len(synonym_table)}")

    # Track changes
    stats = {
        "surface_forms_added": 0,
        "confirm_tokens_added": 0,
        "recipe_counts_added": 0,
        "new_entries_created": 0,
        "clusters_matched": 0,
        "clusters_unmatched": 0,
    }

    # Process each cluster
    unmatched_clusters = []

    for cluster in clusters:
        canonical = cluster["canonical"]
        canonical_lower = canonical.lower()
        aliases = cluster.get("aliases", [])
        total_count = cluster["totalUsage"]

        # Collect all surface forms from this cluster
        all_forms = [canonical] + [a["name"] for a in aliases]

        # Try to find matching ontology entry
        matched_slug = None

        # 1. Direct surface form match
        if canonical_lower in surface_to_slug:
            matched_slug = surface_to_slug[canonical_lower]
        else:
            # 2. Try slug match
            cluster_slug = slugify(canonical)
            if cluster_slug in slug_to_entry:
                matched_slug = cluster_slug
            else:
                # 3. Try matching any alias
                for alias in aliases:
                    alias_lower = alias["name"].lower()
                    if alias_lower in surface_to_slug:
                        matched_slug = surface_to_slug[alias_lower]
                        break

        if matched_slug:
            stats["clusters_matched"] += 1
            entry = slug_to_entry[matched_slug]

            # Add new surface forms
            existing_forms = {sf.lower() for sf in entry.get("surfaceForms", [])}
            for form in all_forms:
                if form.lower() not in existing_forms:
                    entry.setdefault("surfaceForms", []).append(form)
                    existing_forms.add(form.lower())
                    stats["surface_forms_added"] += 1

            # Add recipe count
            if "recipeCount" not in entry or entry.get("recipeCount", 0) < total_count:
                entry["recipeCount"] = total_count
                stats["recipe_counts_added"] += 1

            # Add confirm tokens from SYNONYM_TABLE if available
            if canonical_lower in synonym_table:
                confirm_tokens = synonym_table[canonical_lower]
                if "confirmTokens" not in entry:
                    entry["confirmTokens"] = confirm_tokens
                    stats["confirm_tokens_added"] += 1

            # Update surface_to_slug for new forms
            for form in all_forms:
                surface_to_slug[form.lower()] = matched_slug
        else:
            stats["clusters_unmatched"] += 1
            unmatched_clusters.append({
                "canonical": canonical,
                "count": total_count,
                "aliases": [a["name"] for a in aliases[:5]],
            })

    # Add confirm tokens from SYNONYM_TABLE that weren't in clusters
    for key, tokens in synonym_table.items():
        slug = surface_to_slug.get(key)
        if slug and slug in slug_to_entry:
            entry = slug_to_entry[slug]
            if "confirmTokens" not in entry:
                entry["confirmTokens"] = tokens
                stats["confirm_tokens_added"] += 1

    # Sort ontology by slug
    ontology.sort(key=lambda e: e["slug"])

    # Output stats
    print(f"\n=== Results ===")
    print(f"Clusters matched to ontology: {stats['clusters_matched']}")
    print(f"Clusters unmatched: {stats['clusters_unmatched']}")
    print(f"Surface forms added: {stats['surface_forms_added']}")
    print(f"Confirm tokens added: {stats['confirm_tokens_added']}")
    print(f"Recipe counts added: {stats['recipe_counts_added']}")

    # Show sample of unmatched (potential new entries)
    print(f"\n=== TOP 30 UNMATCHED CLUSTERS (potential new entries) ===")
    unmatched_clusters.sort(key=lambda x: -x["count"])
    for c in unmatched_clusters[:30]:
        alias_str = f" + {c['aliases'][:3]}" if c["aliases"] else ""
        print(f"  [{c['count']:6}] {c['canonical']}{alias_str}")

    # Count entries with new fields
    with_confirm = sum(1 for e in ontology if "confirmTokens" in e)
    with_recipe_count = sum(1 for e in ontology if "recipeCount" in e)
    total_surface_forms = sum(len(e.get("surfaceForms", [])) for e in ontology)

    print(f"\n=== FINAL ONTOLOGY STATS ===")
    print(f"Total entries: {len(ontology)}")
    print(f"Total surface forms: {total_surface_forms}")
    print(f"Entries with confirmTokens: {with_confirm}")
    print(f"Entries with recipeCount: {with_recipe_count}")

    if args.dry_run:
        print("\n[DRY RUN - no files written]")
    else:
        # Write updated ontology
        out_path = ROOT / "data" / "ingredient-ontology-v2.json"
        out_path.write_text(json.dumps(ontology, indent=2, ensure_ascii=False))
        print(f"\nWritten to {out_path}")

        # Write unmatched clusters for review
        unmatched_path = ROOT / "data" / "unmatched-clusters.json"
        unmatched_path.write_text(json.dumps({
            "generated": "2026-02-05",
            "description": "Clusters from recipe corpus with no ontology match - candidates for new entries",
            "total": len(unmatched_clusters),
            "clusters": unmatched_clusters,
        }, indent=2))
        print(f"Written unmatched to {unmatched_path}")

if __name__ == "__main__":
    main()
