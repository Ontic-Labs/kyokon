import { notFound } from "next/navigation";
import Link from "next/link";
import { getIngredientBySlug } from "@/lib/data/ingredients";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const ingredient = await getIngredientBySlug(slug);
  return {
    title: ingredient
      ? `${ingredient.ingredientName} | Kyokon`
      : "Ingredient Not Found | Kyokon",
  };
}

export default async function IngredientDetailPage({ params }: Props) {
  const { slug } = await params;
  const ingredient = await getIngredientBySlug(slug);

  if (!ingredient) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/ingredients"
          className="text-sm text-text-link hover:text-text-link-hover"
        >
          &larr; Back to ingredients
        </Link>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-text-primary">
          {ingredient.ingredientName}
        </h1>
        <div className="flex flex-wrap gap-4 text-sm text-text-secondary">
          <span>
            Slug:{" "}
            <span className="font-mono text-text-muted">
              {ingredient.ingredientSlug}
            </span>
          </span>
          <span>
            Recipe frequency:{" "}
            <span className="tabular-nums">
              {ingredient.frequency.toLocaleString()}
            </span>
          </span>
          <span>
            Mapped foods:{" "}
            <span className="tabular-nums">
              {ingredient.fdcCount.toLocaleString()}
            </span>
          </span>
          {ingredient.syntheticFdcId && (
            <span>
              Synthetic FDC ID:{" "}
              <span className="font-mono text-text-muted">
                {ingredient.syntheticFdcId}
              </span>
            </span>
          )}
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text-primary">
          Nutrient Boundaries ({ingredient.nutrients.length})
        </h2>
        <p className="text-sm text-text-secondary">
          Statistical aggregates per 100g computed from all mapped FDC foods.
        </p>

        {ingredient.nutrients.length > 0 ? (
          <div className="border border-border-default rounded-md overflow-x-auto">
            <table className="w-full min-w-200">
              <thead>
                <tr className="bg-table-header-bg text-table-header-text text-sm">
                  <th className="text-left px-4 py-2 font-medium">Nutrient</th>
                  <th className="text-right px-4 py-2 font-medium">Median</th>
                  <th className="text-right px-4 py-2 font-medium">P10</th>
                  <th className="text-right px-4 py-2 font-medium">P25</th>
                  <th className="text-right px-4 py-2 font-medium">P75</th>
                  <th className="text-right px-4 py-2 font-medium">P90</th>
                  <th className="text-right px-4 py-2 font-medium">Min</th>
                  <th className="text-right px-4 py-2 font-medium">Max</th>
                  <th className="text-right px-4 py-2 font-medium">Samples</th>
                </tr>
              </thead>
              <tbody>
                {ingredient.nutrients.map((n, i) => (
                  <tr
                    key={n.nutrientId}
                    className={`border-t border-table-border ${
                      i % 2 === 0 ? "bg-table-row-bg" : "bg-table-row-alt-bg"
                    }`}
                  >
                    <td className="px-4 py-1.5 text-sm text-text-primary">
                      {n.name}{" "}
                      <span className="text-text-muted">({n.unit})</span>
                    </td>
                    <td className="px-4 py-1.5 text-sm text-text-primary text-right font-mono">
                      {n.median.toFixed(2)}
                    </td>
                    <td className="px-4 py-1.5 text-sm text-text-muted text-right font-mono">
                      {n.p10 !== null ? n.p10.toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-1.5 text-sm text-text-muted text-right font-mono">
                      {n.p25 !== null ? n.p25.toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-1.5 text-sm text-text-muted text-right font-mono">
                      {n.p75 !== null ? n.p75.toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-1.5 text-sm text-text-muted text-right font-mono">
                      {n.p90 !== null ? n.p90.toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-1.5 text-sm text-text-muted text-right font-mono">
                      {n.min.toFixed(2)}
                    </td>
                    <td className="px-4 py-1.5 text-sm text-text-muted text-right font-mono">
                      {n.max.toFixed(2)}
                    </td>
                    <td className="px-4 py-1.5 text-sm text-text-muted text-right tabular-nums">
                      {n.nSamples}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-text-muted">
            No nutrient data available for this ingredient yet.
          </div>
        )}
      </section>
    </div>
  );
}
