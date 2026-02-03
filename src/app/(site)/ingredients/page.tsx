import Link from "next/link";
import { searchIngredients } from "@/lib/data/ingredients";
import IngredientSearchForm from "@/components/ingredient-search-form";
import Pagination from "@/components/pagination";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ingredients | Kyokon",
};

export default async function IngredientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;

  const results = await searchIngredients({
    q: params.q || undefined,
    hasNutrients: params.hasNutrients === "true" ? true : undefined,
    page: params.page ? Number(params.page) : 1,
    pageSize: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          Canonical Ingredients
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {results.total.toLocaleString()} recipe-first ingredients mapped to FDC foods with aggregated nutrient boundaries
        </p>
      </div>

      <IngredientSearchForm />

      <div className="bg-surface-raised border border-border-default rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-default bg-surface-inset">
              <th className="text-left px-4 py-2 font-medium text-text-secondary">
                Ingredient
              </th>
              <th className="text-right px-4 py-2 font-medium text-text-secondary w-24">
                Frequency
              </th>
              <th className="text-right px-4 py-2 font-medium text-text-secondary w-24">
                Foods
              </th>
              <th className="text-center px-4 py-2 font-medium text-text-secondary w-24">
                Nutrients
              </th>
            </tr>
          </thead>
          <tbody>
            {results.items.map((item) => (
              <tr
                key={item.canonicalId}
                className="border-b border-border-default last:border-b-0 hover:bg-surface-inset transition-colors"
              >
                <td className="px-4 py-2">
                  <Link
                    href={`/ingredients/${item.ingredientSlug}`}
                    className="text-text-primary hover:text-accent-primary"
                  >
                    {item.ingredientName}
                  </Link>
                </td>
                <td className="text-right px-4 py-2 text-text-muted tabular-nums">
                  {item.frequency.toLocaleString()}
                </td>
                <td className="text-right px-4 py-2 text-text-muted tabular-nums">
                  {item.fdcCount.toLocaleString()}
                </td>
                <td className="text-center px-4 py-2">
                  {item.hasNutrients ? (
                    <span className="text-accent-success">✓</span>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {results.items.length === 0 && (
        <div className="text-center py-12 text-text-muted">
          No ingredients found matching your search.
        </div>
      )}

      <Pagination
        total={results.total}
        page={results.page}
        pageSize={results.pageSize}
      />
    </div>
  );
}
