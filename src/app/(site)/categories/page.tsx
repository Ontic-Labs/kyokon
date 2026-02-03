import Link from "next/link";
import { getCategories } from "@/lib/data/categories";
import Breadcrumb from "@/components/breadcrumb";
import { CategoryWithCount } from "@/types/fdc";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Food Categories",
  description:
    "Browse USDA food categories including dairy, meats, vegetables, fruits, grains, and more.",
  openGraph: {
    title: "Food Categories | Kyokon",
    description:
      "Browse USDA food categories with nutrient data for each group.",
    url: "/categories",
  },
  twitter: {
    card: "summary",
    title: "Food Categories | Kyokon",
    description:
      "Browse USDA food categories.",
  },
  alternates: {
    canonical: "/categories",
  },
};

export default async function CategoriesPage() {
  const categories = (await getCategories(true)) as CategoryWithCount[];

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Categories" }]} />

      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          Food Categories ({categories.length})
        </h1>
        <p className="text-sm text-text-secondary mt-1 max-w-2xl">
          USDA food groups. Click a category to see every food in it with full
          nutrient data.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((cat) => (
          <Link
            key={cat.categoryId}
            href={`/categories/${cat.categoryId}`}
            className="block p-4 bg-surface-raised border border-border-default rounded-md hover:border-border-strong transition-colors"
          >
            <div className="text-sm font-medium text-text-primary">
              {cat.name}
            </div>
            <div className="text-sm text-text-muted mt-1">
              {cat.foodCount.toLocaleString()} foods
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
