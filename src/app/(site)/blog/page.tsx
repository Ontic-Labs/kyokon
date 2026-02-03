import Link from "next/link";
import type { Metadata } from "next";
import Breadcrumb from "@/components/breadcrumb";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Technical articles on empirical ontology, recipe-first architecture, and building nutrition APIs without LLM hallucinations.",
  openGraph: {
    title: "Blog | Kyokon",
    description:
      "Technical articles on empirical ontology, recipe-first architecture, and building nutrition APIs.",
    url: "/blog",
  },
  twitter: {
    card: "summary",
    title: "Blog | Kyokon",
    description:
      "Technical articles on empirical ontology and recipe-first architecture.",
  },
  alternates: {
    canonical: "/blog",
  },
};

const posts = [
  {
    slug: "lexical-scoring-rfc",
    title:
      "RFC: Lexical Entity-Mapping for Safety-Critical Ingredient Matching",
    date: "February 2026",
    description:
      "A deterministic scoring algorithm for matching recipe ingredients to USDA FDC foods. Five signals, zero machine learning, and the invariant that 'oil' must never match 'boiled.'",
    tags: ["architecture", "safety", "scoring"],
  },
  {
    slug: "empirical-ontology-pattern",
    title: "Empirical Ontology for High-Stakes Domains: A Pattern Language",
    date: "February 2026",
    description:
      "Why 'probability' is a euphemism for 'unmanaged risk' in safety-critical systems. A pattern language for building auditable ontologies from usage data instead of LLM inference.",
    tags: ["architecture", "safety", "ontology"],
  },
  {
    slug: "recipe-first-architecture",
    title: "Recipe-First Canonical Naming: A Non-LLM Approach to Ingredient Identity",
    date: "February 2026",
    description:
      "Instead of using machine learning to infer what 'ground beef' means, we count how many times real recipe authors wrote 'ground beef' and use that as the canonical form. The wisdom of crowds replaces the wisdom of weights.",
    tags: ["implementation", "recipes", "canonicalization"],
  },
];

export default function BlogPage() {
  return (
    <div className="space-y-8">
      <Breadcrumb items={[{ label: "Blog" }]} />

      <div>
        <h1 className="text-2xl font-bold text-text-primary">Blog</h1>
        <p className="text-sm text-text-secondary mt-1 max-w-2xl">
          Technical deep-dives on how Kyokon works: why we count recipe usage
          instead of asking an LLM, how canonical naming works, and the
          architecture decisions behind a nutrition API you can actually audit.
        </p>
      </div>

      <div className="space-y-6">
        {posts.map((post) => (
          <article
            key={post.slug}
            className="p-6 bg-surface-raised border border-border-default rounded-md hover:border-border-strong transition-colors"
          >
            <Link href={`/blog/${post.slug}`} className="block space-y-3">
              <div className="flex items-center gap-3 text-xs text-text-muted">
                <time>{post.date}</time>
                <span className="text-border-default">•</span>
                <div className="flex gap-2">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 bg-surface-inset rounded-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <h2 className="text-lg font-semibold text-text-primary hover:text-accent-primary transition-colors">
                {post.title}
              </h2>
              <p className="text-sm text-text-secondary">{post.description}</p>
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
