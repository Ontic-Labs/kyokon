import { notFound } from "next/navigation";
import Link from "next/link";
import { getNutrientById, getTopFoodsForNutrient } from "@/lib/data/nutrients";

export const dynamic = "force-dynamic";
import Pagination from "@/components/pagination";
import DataTable, { Column } from "@/components/data-table";
import type { Metadata } from "next";

interface TopFood {
  fdcId: number;
  description: string;
  amount: number;
  categoryName: string | null;
}

function makeTopFoodColumns(unit: string, pageOffset: number): Column<TopFood>[] {
  return [
    {
      key: "rank",
      header: "#",
      render: (_, i) => <span className="text-text-muted">{pageOffset + i + 1}</span>,
    },
    {
      key: "description",
      header: "Food",
      render: (food) => (
        <Link
          href={`/foods/${food.fdcId}`}
          className="text-text-link hover:text-text-link-hover"
        >
          {food.description}
        </Link>
      ),
    },
    {
      key: "amount",
      header: `Amount (${unit})`,
      align: "right",
      render: (food) => (
        <span className="font-mono">
          {food.amount.toLocaleString(undefined, { maximumFractionDigits: 3 })}
        </span>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (food) => (
        <span className="text-text-secondary">{food.categoryName ?? "—"}</span>
      ),
    },
  ];
}

interface Props {
  params: Promise<{ nutrientId: string }>;
  searchParams: Promise<Record<string, string>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { nutrientId } = await params;
  const nutrient = await getNutrientById(Number(nutrientId));
  return {
    title: nutrient
      ? `${nutrient.name} | Kyokon`
      : "Nutrient Not Found | Kyokon",
  };
}

export default async function NutrientDetailPage({
  params,
  searchParams,
}: Props) {
  const { nutrientId } = await params;
  const sp = await searchParams;
  const nutrient = await getNutrientById(Number(nutrientId));

  if (!nutrient) notFound();

  const page = sp.page ? Number(sp.page) : 1;
  const topFoods = await getTopFoodsForNutrient(
    nutrient.nutrientId,
    page,
    25
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/nutrients"
          className="text-sm text-text-link hover:text-text-link-hover"
        >
          &larr; All nutrients
        </Link>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-text-primary">
          {nutrient.name}
        </h1>
        <div className="flex gap-4 text-sm text-text-secondary">
          <span>
            ID:{" "}
            <span className="font-mono text-text-muted">
              {nutrient.nutrientId}
            </span>
          </span>
          <span>Unit: {nutrient.unit}</span>
          {nutrient.rank && <span>Rank: {nutrient.rank}</span>}
          {nutrient.isEnergy && (
            <span className="px-2 py-0.5 bg-status-info-bg text-status-info rounded-full text-xs">
              Energy
            </span>
          )}
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text-primary">
          Top foods by {nutrient.name.toLowerCase()} content
        </h2>

        <DataTable
          columns={makeTopFoodColumns(nutrient.unit, (page - 1) * 25)}
          data={topFoods.items}
          keyExtractor={(food) => food.fdcId.toString()}
          striped
          minWidthClass="min-w-125"
        />

        <Pagination
          total={topFoods.total}
          page={topFoods.page}
          pageSize={topFoods.pageSize}
        />
      </section>
    </div>
  );
}
