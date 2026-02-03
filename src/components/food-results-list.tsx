"use client";

import Link from "next/link";
import { FoodListItem } from "@/types/fdc";
import DataTable, { Column } from "@/components/data-table";
import SortableHeader from "@/components/sortable-header";

interface FoodResultsListProps {
  items: FoodListItem[];
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
