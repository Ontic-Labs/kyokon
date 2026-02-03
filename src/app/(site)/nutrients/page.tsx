import Link from "next/link";
import { searchNutrients } from "@/lib/data/nutrients";
import Pagination from "@/components/pagination";
import DataTable, { Column } from "@/components/data-table";
import SortableHeader from "@/components/sortable-header";
import TableFilterBar from "@/components/table-filter-bar";
import Breadcrumb from "@/components/breadcrumb";
import type { NutrientListItem } from "@/types/fdc";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Nutrients",
  description:
    "Browse all nutrients tracked in USDA FoodData Central including vitamins, minerals, macronutrients, and more.",
  openGraph: {
    title: "Nutrients | Kyokon",
    description:
      "Browse all nutrients tracked in USDA FoodData Central.",
    url: "/nutrients",
  },
  twitter: {
    card: "summary",
    title: "Nutrients | Kyokon",
    description:
      "Browse vitamins, minerals, and macronutrients.",
  },
  alternates: {
    canonical: "/nutrients",
  },
};

const columns: Column<NutrientListItem>[] = [
  {
    key: "id",
    header: "ID",
    cellClassName: "text-text-muted font-mono",
    renderHeader: () => <SortableHeader column="id" label="ID" />,
    render: (n) => n.nutrientId,
  },
  {
    key: "name",
    header: "Name",
    renderHeader: () => <SortableHeader column="name" label="Name" />,
    render: (n) => (
      <Link
        href={`/nutrients/${n.nutrientId}`}
        className="text-text-link hover:text-text-link-hover"
      >
        {n.name}
      </Link>
    ),
  },
  {
    key: "unit",
    header: "Unit",
    renderHeader: () => <SortableHeader column="unit" label="Unit" />,
    cellClassName: "text-text-secondary",
    render: (n) => n.unit,
  },
  {
    key: "rank",
    header: "Rank",
    align: "right",
    renderHeader: () => <SortableHeader column="rank" label="Rank" />,
    cellClassName: "text-text-muted font-mono",
    render: (n) => n.rank ?? "—",
  },
];

export default async function NutrientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;

  const sortBy =
    params.sortBy && ["rank", "name", "unit", "id"].includes(params.sortBy)
      ? (params.sortBy as "rank" | "name" | "unit" | "id")
      : undefined;
  const sortDir = params.sortDir === "desc" ? "desc" : "asc";
  const results = await searchNutrients({
    search: params.search || undefined,
    sortBy,
    sortDir,
    page: params.page ? Number(params.page) : 1,
    pageSize: 50,
  });

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Nutrients" }]} />

      <div>
        <h1 className="text-2xl font-bold text-text-primary">Nutrients</h1>
        <p className="text-sm text-text-secondary mt-1 max-w-2xl">
          Every nutrient tracked by USDA FoodData Central &mdash; vitamins,
          minerals, macros, amino acids, and more. Click any nutrient to see
          which foods contain the most of it.
        </p>
      </div>

      <TableFilterBar
        basePath="/nutrients"
        queryParam="search"
        queryPlaceholder="Search nutrients (e.g., vitamin, protein)..."
      />

      <DataTable
        columns={columns}
        data={results.items}
        keyExtractor={(n) => n.nutrientId}
        emptyMessage="No nutrients found."
        striped
      />

      <Pagination
        total={results.total}
        page={results.page}
        pageSize={results.pageSize}
      />
    </div>
  );
}
