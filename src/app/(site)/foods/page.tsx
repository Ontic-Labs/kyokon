import { Suspense } from "react";
import { searchFoods } from "@/lib/data/foods";
import { getCategories } from "@/lib/data/categories";
import FoodSearchForm from "@/components/food-search-form";
import FoodResultsList from "@/components/food-results-list";
import Pagination from "@/components/pagination";
import { CategoryInfo } from "@/types/fdc";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Food Search | Kyokon",
};

export default async function FoodsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const categories = (await getCategories(false)) as CategoryInfo[];

  const results = await searchFoods({
    q: params.q || undefined,
    categoryId: params.categoryId ? Number(params.categoryId) : undefined,
    nutrientId: params.nutrientId ? Number(params.nutrientId) : undefined,
    min: params.min ? Number(params.min) : undefined,
    max: params.max ? Number(params.max) : undefined,
    cookable:
      params.cookable === "true"
        ? true
        : params.cookable === "false"
          ? false
          : undefined,
    state: params.state || undefined,
    preservation: params.preservation || undefined,
    processing: params.processing || undefined,
    sortBy: params.sortBy || undefined,
    sortDir: params.sortDir === "desc" ? "desc" : params.sortDir === "asc" ? "asc" : undefined,
    page: params.page ? Number(params.page) : 1,
    pageSize: 25,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">Food Search</h1>

      <Suspense fallback={<div className="h-32 animate-pulse bg-surface-raised rounded-md" />}>
        <FoodSearchForm categories={categories} />
      </Suspense>

      <Suspense fallback={<div className="h-64 animate-pulse bg-surface-raised rounded-md" />}>
        <FoodResultsList items={results.items} />
      </Suspense>

      <Suspense fallback={null}>
        <Pagination
          total={results.total}
          page={results.page}
          pageSize={results.pageSize}
        />
      </Suspense>
    </div>
  );
}
