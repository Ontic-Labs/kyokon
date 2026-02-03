import { notFound } from "next/navigation";
import Link from "next/link";
import { getIngredientBySlug } from "@/lib/data/ingredients";
import DataTable, { Column } from "@/components/data-table";
import type { IngredientNutrient } from "@/types/fdc";
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

const nutrientColumns: Column<IngredientNutrient>[] = [
  {
    key: "name",
    header: "Nutrient",
    cellClassName: "text-text-primary",
    render: (n) => (
      <>
        {n.name} <span className="text-text-muted">({n.unit})</span>
      </>
    ),
  },
  {
    key: "median",
    header: "Median",
    align: "right",
    cellClassName: "text-text-primary font-mono",
    render: (n) => n.median.toFixed(2),
  },
  {
    key: "p10",
    header: "P10",
    align: "right",
    cellClassName: "text-text-muted font-mono",
    render: (n) => (n.p10 !== null ? n.p10.toFixed(2) : "—"),
  },
  {
    key: "p25",
    header: "P25",
    align: "right",
    cellClassName: "text-text-muted font-mono",
    render: (n) => (n.p25 !== null ? n.p25.toFixed(2) : "—"),
  },
  {
    key: "p75",
    header: "P75",
    align: "right",
    cellClassName: "text-text-muted font-mono",
    render: (n) => (n.p75 !== null ? n.p75.toFixed(2) : "—"),
  },
  {
    key: "p90",
    header: "P90",
    align: "right",
    cellClassName: "text-text-muted font-mono",
    render: (n) => (n.p90 !== null ? n.p90.toFixed(2) : "—"),
  },
  {
    key: "min",
    header: "Min",
    align: "right",
    cellClassName: "text-text-muted font-mono",
    render: (n) => n.min.toFixed(2),
  },
  {
    key: "max",
    header: "Max",
    align: "right",
    cellClassName: "text-text-muted font-mono",
    render: (n) => n.max.toFixed(2),
  },
  {
    key: "nSamples",
    header: "Samples",
    align: "right",
    cellClassName: "text-text-muted tabular-nums",
    render: (n) => n.nSamples,
  },
];

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

        <DataTable
          columns={nutrientColumns}
          data={ingredient.nutrients}
          keyExtractor={(n) => n.nutrientId}
          emptyMessage="No nutrient data available for this ingredient yet."
          striped
        />
      </section>
    </div>
  );
}
