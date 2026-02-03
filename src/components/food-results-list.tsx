"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FoodListItem } from "@/types/fdc";
import DataTable, { Column } from "@/components/data-table";

interface FoodResultsListProps {
  items: FoodListItem[];
}

function SortableHeader({
  column,
  label,
}: {
  column: string;
  label: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read sort state from URL params for consistency
  const currentSort = searchParams.get("sortBy");
  const currentDir = searchParams.get("sortDir") as "asc" | "desc" | null;

  const isActive = currentSort === column;
  const nextDir = isActive && currentDir === "asc" ? "desc" : "asc";

  const handleSort = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sortBy", column);
    params.set("sortDir", nextDir);
    params.delete("page"); // Reset to page 1 on sort change
    router.push(`?${params.toString()}`);
  };

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 cursor-pointer hover:text-text-primary select-none"
      onClick={handleSort}
      aria-pressed={isActive}
      aria-label={`Sort by ${label}${isActive ? ` (${currentDir})` : ""}`}
    >
      {label}
      <span className={`text-xs ${isActive ? "text-text-primary" : "text-text-muted opacity-50"}`}>
        {isActive
          ? (currentDir === "asc" ? "▲" : "▼")
          : "▲▼"}
      </span>
    </button>
  );
}

const foodColumns: Column<FoodListItem>[] = [
  {
    key: "fdcId",
    header: "FDC ID",
    renderHeader: () => <SortableHeader column="fdcId" label="FDC ID" />,
    render: (item) => <span className="text-text-muted font-mono">{item.fdcId}</span>,
  },
  {
    key: "description",
    header: "Description",
    renderHeader: () => <SortableHeader column="description" label="Description" />,
    render: (item) => (
      <Link
        href={`/foods/${item.fdcId}`}
        className="text-text-link hover:text-text-link-hover"
      >
        {item.description}
      </Link>
    ),
  },
  {
    key: "category",
    header: "Category",
    renderHeader: () => <SortableHeader column="category" label="Category" />,
    render: (item) => (
      <span className="text-text-secondary">{item.categoryName ?? "—"}</span>
    ),
  },
  {
    key: "source",
    header: "Source",
    renderHeader: () => <SortableHeader column="source" label="Source" />,
    render: (item) => (
      <span className="text-text-secondary">{item.dataType ?? "—"}</span>
    ),
  },
];

export default function FoodResultsList({ items }: FoodResultsListProps) {
  return (
    <DataTable
      columns={foodColumns}
      data={items}
      keyExtractor={(item) => item.fdcId.toString()}
      emptyMessage="No foods found matching your criteria."
      striped
      minWidthClass="min-w-125"
    />
  );
}
