import { MetadataRoute } from "next";
import { query } from "@/lib/db";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://kyokon.ai";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/foods`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/ingredients`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/canonicals`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/categories`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/nutrients`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/docs`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/blog`,
      changeFrequency: "weekly",
      priority: 0.6,
    },
  ];

  // Dynamic food pages
  const foodPages: MetadataRoute.Sitemap = [];
  try {
    const result = await query<{ fdc_id: number }>(
      "SELECT fdc_id FROM foods ORDER BY fdc_id LIMIT 10000"
    );
    for (const row of result.rows) {
      foodPages.push({
        url: `${BASE_URL}/foods/${row.fdc_id}`,
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
  } catch {
    // Database not available, skip dynamic pages
  }

  // Dynamic ingredient pages
  const ingredientPages: MetadataRoute.Sitemap = [];
  try {
    const result = await query<{ canonical_slug: string }>(
      "SELECT canonical_slug FROM canonical_ingredient ORDER BY canonical_rank LIMIT 10000"
    );
    for (const row of result.rows) {
      ingredientPages.push({
        url: `${BASE_URL}/ingredients/${row.canonical_slug}`,
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
  } catch {
    // Database not available, skip dynamic pages
  }

  // Dynamic category pages
  const categoryPages: MetadataRoute.Sitemap = [];
  try {
    const result = await query<{ id: number }>(
      "SELECT id FROM food_categories ORDER BY id"
    );
    for (const row of result.rows) {
      categoryPages.push({
        url: `${BASE_URL}/categories/${row.id}`,
        changeFrequency: "monthly",
        priority: 0.5,
      });
    }
  } catch {
    // Database not available, skip dynamic pages
  }

  // Dynamic nutrient pages
  const nutrientPages: MetadataRoute.Sitemap = [];
  try {
    const result = await query<{ id: number }>(
      "SELECT id FROM nutrients ORDER BY id"
    );
    for (const row of result.rows) {
      nutrientPages.push({
        url: `${BASE_URL}/nutrients/${row.id}`,
        changeFrequency: "monthly",
        priority: 0.5,
      });
    }
  } catch {
    // Database not available, skip dynamic pages
  }

  return [
    ...staticPages,
    ...foodPages,
    ...ingredientPages,
    ...categoryPages,
    ...nutrientPages,
  ];
}
