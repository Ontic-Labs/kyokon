import { notFound } from "next/navigation";
import { getCategoryById } from "@/lib/data/categories";

export const dynamic = "force-dynamic";
import { searchFoods } from "@/lib/data/foods";
import FoodResultsList from "@/components/food-results-list";
import Pagination from "@/components/pagination";
import Breadcrumb from "@/components/breadcrumb";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ categoryId: string }>;
  searchParams: Promise<Record<string, string>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categoryId } = await params;
  const category = await getCategoryById(Number(categoryId));
  
  if (!category) {
    return { title: "Category Not Found" };
  }

  const title = category.name;
  const description = `Browse all foods in the ${category.name} category. Explore nutrition data for ${category.name.toLowerCase()}.`;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Kyokon`,
      description,
      type: "article",
      url: `/categories/${categoryId}`,
    },
    twitter: {
      card: "summary",
      title: `${title} | Kyokon`,
      description,
    },
    alternates: {
      canonical: `/categories/${categoryId}`,
    },
  };
}

export default async function CategoryDetailPage({
  params,
  searchParams,
}: Props) {
  const { categoryId } = await params;
  const sp = await searchParams;
  const category = await getCategoryById(Number(categoryId));

  if (!category) notFound();

  const page = sp.page ? Number(sp.page) : 1;
  const results = await searchFoods({
    categoryId: category.categoryId,
    page,
    pageSize: 25,
  });

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Categories", href: "/categories" },
          { label: category.name },
        ]}
      />

      <h1 className="text-2xl font-bold text-text-primary">
        {category.name}
      </h1>
      <p className="text-sm text-text-secondary">
        {results.total.toLocaleString()} foods in this category
      </p>

      <FoodResultsList items={results.items} />

      <Pagination
        total={results.total}
        page={results.page}
        pageSize={results.pageSize}
      />
    </div>
  );
}
