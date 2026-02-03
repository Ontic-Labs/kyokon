import { notFound } from "next/navigation";
import Link from "next/link";
import fs from "fs/promises";
import path from "path";
import type { Metadata } from "next";
import MarkdownRenderer from "@/components/markdown-renderer";

const posts: Record<
  string,
  { file: string; title: string; date: string }
> = {
  "empirical-ontology-pattern": {
    file: "empirical-ontology-pattern.md",
    title: "Empirical Ontology for High-Stakes Domains: A Pattern Language",
    date: "February 2026",
  },
  "recipe-first-architecture": {
    file: "recipe-first-architecture.md",
    title: "Recipe-First Canonical Naming: A Non-LLM Approach to Ingredient Identity",
    date: "February 2026",
  },
};

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return Object.keys(posts).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = posts[slug];
  if (!post) {
    return { title: "Not Found | Kyokon" };
  }
  return {
    title: `${post.title} | Kyokon`,
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = posts[slug];

  if (!post) notFound();

  const filePath = path.join(process.cwd(), "docs", post.file);
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch {
    notFound();
  }

  // Strip the header block (title + metadata) up to and including the first ---
  // The docs have format: # Title\n\n**metadata**\n\n---\n\n## First Section
  const firstHrIndex = content.indexOf("\n---\n");
  const contentWithoutHeader = firstHrIndex !== -1 
    ? content.slice(firstHrIndex + 5).trimStart()
    : content;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/blog"
          className="text-sm text-text-link hover:text-text-link-hover"
        >
          &larr; Back to blog
        </Link>
      </div>

      <article className="prose prose-invert prose-lg max-w-none">
        <div className="not-prose mb-8">
          <time className="text-sm text-text-muted">{post.date}</time>
          <h1 className="text-2xl font-bold text-text-primary mt-2">
            {post.title}
          </h1>
        </div>
        <MarkdownRenderer content={contentWithoutHeader} />
      </article>
    </div>
  );
}
