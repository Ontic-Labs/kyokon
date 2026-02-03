import Link from "next/link";
import { searchCanonicals, CanonicalListItem } from "@/lib/data/canonicals";
import Pagination from "@/components/pagination";
import DataTable, { Column } from "@/components/data-table";
import SortableHeader from "@/components/sortable-header";
import TableFilterBar from "@/components/table-filter-bar";
import Breadcrumb from "@/components/breadcrumb";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Canonical Ingredients",
  description:
    "Browse canonical ingredient names that map to USDA foods. Standard ingredient vocabulary for recipe parsing.",
  openGraph: {
    title: "Canonical Ingredients | Kyokon",
    description:
      "Browse canonical ingredient names that map to USDA foods.",
    url: "/canonicals",
  },
  twitter: {
    card: "summary",
    title: "Canonical Ingredients | Kyokon",
    description:
      "Browse canonical ingredient names for recipe parsing.",
  },
  alternates: {
    canonical: "/canonicals",
  },
};

const columns: Column<CanonicalListItem>[] = [
  {
    key: "id",
    header: "ID",
    width: "w-28",
    cellClassName: "text-text-muted tabular-nums font-mono text-xs",
    renderHeader: () => <SortableHeader column="id" label="ID" />,
    render: (item) => item.canonicalId.toLocaleString(),
  },
  {
    key: "name",
    header: "Canonical Name",
    renderHeader: () => <SortableHeader column="name" label="Canonical Name" />,
    render: (item) => (
      <Link
        href={`/foods?canonicalSlug=${item.canonicalSlug}`}
        className="text-text-link hover:text-text-link-hover hover:underline underline-offset-2"
      >
        {item.canonicalName}
      </Link>
    ),
  },
  {
    key: "foods",
    header: "Foods",
    align: "right",
    width: "w-24",
    cellClassName: "text-text-muted tabular-nums",
    renderHeader: () => <SortableHeader column="foods" label="Foods" />,
    render: (item) => item.foodCount.toLocaleString(),
  },
];

export default async function CanonicalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;

  const sortBy =
    params.sortBy && ["name", "foods", "id"].includes(params.sortBy)
      ? (params.sortBy as "name" | "foods" | "id")
      : undefined;
  const sortDir = params.sortDir === "desc" ? "desc" : "asc";

  const results = await searchCanonicals({
    q: params.q || undefined,
    sortBy,
    sortDir,
    page: params.page ? Number(params.page) : 1,
    pageSize: 50,
  });

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Canonicals" }]} />

      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          Canonical Names
        </h1>
        <p className="text-sm text-text-secondary mt-1 max-w-2xl">
          The base identity we extracted from each USDA food description.
          &ldquo;Chicken, breast, raw&rdquo; and &ldquo;Chicken breast,
          skinless, raw&rdquo; both map to the canonical name{" "}
          <strong>chicken breast</strong>. Click a name to see all foods that
          share it.{" "}
          <span className="tabular-nums">{results.total.toLocaleString()}</span> canonical
          names indexed.
        </p>
      </div>

      <TableFilterBar
        basePath="/canonicals"
        queryParam="q"
        queryPlaceholder="Search canonical names..."
      />

      <DataTable
        columns={columns}
        data={results.items}
        keyExtractor={(item) => item.canonicalId}
        emptyMessage="No canonical names found matching your search."
      />

      <Pagination
        total={results.total}
        page={results.page}
        pageSize={results.pageSize}
      />
    </div>
  );
}
