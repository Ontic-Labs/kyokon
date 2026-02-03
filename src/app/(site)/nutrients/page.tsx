import Link from "next/link";
import { searchNutrients } from "@/lib/data/nutrients";
import Pagination from "@/components/pagination";
import DataTable, { Column } from "@/components/data-table";
import SortableHeader from "@/components/sortable-header";
import TableFilterBar from "@/components/table-filter-bar";
import type { NutrientListItem } from "@/types/fdc";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Nutrients | Kyokon",
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
      <h1 className="text-2xl font-bold text-text-primary">Nutrients</h1>

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
