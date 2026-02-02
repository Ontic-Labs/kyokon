"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FoodListItem } from "@/types/fdc";

interface FoodResultsListProps {
  items: FoodListItem[];
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

function SortableHeader({
  column,
  label,
  currentSort,
  currentDir,
}: {
  column: string;
  label: string;
  currentSort?: string;
  currentDir?: "asc" | "desc";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

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
    <th
      className="text-left px-4 py-2 font-medium cursor-pointer hover:bg-table-row-hover select-none"
      onClick={handleSort}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && (
          <span className="text-xs">{currentDir === "asc" ? "▲" : "▼"}</span>
        )}
      </span>
    </th>
  );
}

export default function FoodResultsList({ items, sortBy, sortDir }: FoodResultsListProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-text-muted">
        No foods found matching your criteria.
      </div>
    );
  }

  return (
    <div className="border border-border-default rounded-md overflow-x-auto">
      <table className="w-full min-w-125">
        <thead>
          <tr className="bg-table-header-bg text-table-header-text text-sm">
            <SortableHeader column="fdcId" label="FDC ID" currentSort={sortBy} currentDir={sortDir} />
            <SortableHeader column="description" label="Description" currentSort={sortBy} currentDir={sortDir} />
            <SortableHeader column="category" label="Category" currentSort={sortBy} currentDir={sortDir} />
            <SortableHeader column="source" label="Source" currentSort={sortBy} currentDir={sortDir} />
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr
              key={item.fdcId}
              className={`border-t border-table-border hover:bg-table-row-hover ${
                i % 2 === 0 ? "bg-table-row-bg" : "bg-table-row-alt-bg"
              }`}
            >
              <td className="px-4 py-2 text-sm text-text-muted font-mono">
                {item.fdcId}
              </td>
              <td className="px-4 py-2 text-sm">
                <Link
                  href={`/foods/${item.fdcId}`}
                  className="text-text-link hover:text-text-link-hover"
                >
                  {item.description}
                </Link>
              </td>
              <td className="px-4 py-2 text-sm text-text-secondary">
                {item.categoryName ?? "—"}
              </td>
              <td className="px-4 py-2 text-sm text-text-secondary">
                {item.dataType ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
