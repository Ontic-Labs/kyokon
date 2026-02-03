import { notFound } from "next/navigation";
import Link from "next/link";
import { getIngredientBySlug } from "@/lib/data/ingredients";

export const dynamic = "force-dynamic";
import DataTable, { Column } from "@/components/data-table";
import Breadcrumb from "@/components/breadcrumb";
import type {
  IngredientNutrient,
  IngredientAlias,
  IngredientMemberFood,
} from "@/types/fdc";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const ingredient = await getIngredientBySlug(slug);
  
  if (!ingredient) {
    return { title: "Ingredient Not Found" };
  }

  const title = ingredient.ingredientName;
  const description = `Nutrition data for ${ingredient.ingredientName}. Explore member foods, nutrient profiles, and recipe usage.`;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Kyokon`,
      description,
      type: "article",
      url: `/ingredients/${slug}`,
    },
    twitter: {
      card: "summary",
      title: `${title} | Kyokon`,
      description,
    },
    alternates: {
      canonical: `/ingredients/${slug}`,
    },
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

const aliasColumns: Column<IngredientAlias>[] = [
  {
    key: "aliasNorm",
    header: "Alias",
    cellClassName: "text-text-primary",
    render: (a) => a.aliasNorm,
  },
  {
    key: "aliasCount",
    header: "Frequency",
    align: "right",
    cellClassName: "text-text-muted tabular-nums",
    render: (a) => a.aliasCount.toLocaleString(),
  },
  {
    key: "aliasSource",
    header: "Source",
    cellClassName: "text-text-muted",
    render: (a) => a.aliasSource,
  },
];

const memberFoodColumns: Column<IngredientMemberFood>[] = [
  {
    key: "fdcId",
    header: "FDC ID",
    width: "w-24",
    cellClassName: "font-mono",
    render: (f) => (
      <Link
        href={`/foods/${f.fdcId}`}
        className="text-text-link hover:text-text-link-hover"
      >
        {f.fdcId}
      </Link>
    ),
  },
  {
    key: "description",
    header: "Description",
    cellClassName: "text-text-primary",
    render: (f) => f.description,
  },
  {
    key: "dataType",
    header: "Type",
    width: "w-32",
    cellClassName: "text-text-muted",
    render: (f) => f.dataType ?? "—",
  },
  {
    key: "membershipReason",
    header: "Match Reason",
    width: "w-36",
    cellClassName: "text-text-muted",
    render: (f) => f.membershipReason,
  },
];

export default async function IngredientDetailPage({ params }: Props) {
  const { slug } = await params;
  const ingredient = await getIngredientBySlug(slug);

  if (!ingredient) notFound();

  return (
    <div className="space-y-8">
      <Breadcrumb
        items={[
          { label: "Synthetic Ingredients", href: "/ingredients" },
          { label: ingredient.ingredientName },
        ]}
      />

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-text-primary">
            {ingredient.ingredientName}
          </h1>
          <a
            href={`/api/public/ingredients/${ingredient.ingredientSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 px-3 py-1.5 text-sm font-medium rounded-sm border border-border-default text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
          >
            JSON
          </a>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-secondary">
          <span>
            Slug:{" "}
            <span className="font-mono text-text-muted">
              {ingredient.ingredientSlug}
            </span>
          </span>
          <span>
            Rank:{" "}
            <span className="tabular-nums">
              #{ingredient.canonicalRank.toLocaleString()}
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

      {/* Nutrient Profile */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text-primary">
          Nutrient Profile ({ingredient.nutrients.length})
        </h2>
        <p className="text-sm text-text-secondary">
          What you&apos;d get in 100 g of this ingredient, based on{" "}
          {ingredient.fdcCount} real USDA foods. <strong>Median</strong> is our
          best estimate. The P10&ndash;P90 columns show how much the value varies
          across different source foods &mdash; a wide range means the nutrient
          content depends heavily on the specific product.
        </p>

        <DataTable
          columns={nutrientColumns}
          data={ingredient.nutrients}
          keyExtractor={(n) => n.nutrientId}
          emptyMessage="No nutrient data computed yet. Run aggregate-recipe-nutrients.ts to populate."
          striped
          maxHeightClass="max-h-[36rem]"
        />
      </section>

      {/* Aliases (provenance) */}
      {ingredient.aliases.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-text-primary">
            Aliases ({ingredient.aliases.length})
          </h2>
          <p className="text-sm text-text-secondary">
            Different ways recipe authors refer to this ingredient. When someone
            types any of these names, we resolve it to{" "}
            <strong>{ingredient.ingredientName}</strong>. Frequency shows how
            often each spelling appeared across 231K recipes.
          </p>

          <DataTable
            columns={aliasColumns}
            data={ingredient.aliases}
            keyExtractor={(a) => a.aliasNorm}
            striped
            maxHeightClass="max-h-[28rem]"
          />
        </section>
      )}

      {/* Member Foods (provenance) */}
      {ingredient.memberFoods.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-text-primary">
            Mapped FDC Foods ({ingredient.memberFoods.length})
          </h2>
          <p className="text-sm text-text-secondary">
            The actual USDA FoodData Central entries whose nutrient data we
            averaged to build the profile above. Each food links to its full
            nutrient breakdown. &ldquo;Match Reason&rdquo; shows how we decided
            this USDA food belongs to{" "}
            <strong>{ingredient.ingredientName}</strong>.
          </p>

          <DataTable
            columns={memberFoodColumns}
            data={ingredient.memberFoods}
            keyExtractor={(f) => f.fdcId}
            striped
            maxHeightClass="max-h-[28rem]"
          />
        </section>
      )}
    </div>
  );
}
