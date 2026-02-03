"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface SortableHeaderProps {
  column: string;
  label: string;
  className?: string;
}

export default function SortableHeader({
  column,
  label,
  className,
}: SortableHeaderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentSort = searchParams.get("sortBy");
  const currentDir = searchParams.get("sortDir") as "asc" | "desc" | null;

  const isActive = currentSort === column;
  const nextDir = isActive && currentDir === "asc" ? "desc" : "asc";

  const handleSort = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sortBy", column);
    params.set("sortDir", nextDir);
    params.delete("page");
    router.push(`?${params.toString()}`);
  };

  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 cursor-pointer hover:text-text-primary select-none ${className ?? ""}`}
      onClick={handleSort}
      aria-pressed={isActive}
      aria-label={`Sort by ${label}${isActive ? ` (${currentDir})` : ""}`}
    >
      {label}
      <span
        className={`text-xs ${
          isActive ? "text-text-primary" : "text-text-muted opacity-50"
        }`}
      >
        {isActive ? (currentDir === "asc" ? "▲" : "▼") : "▲▼"}
      </span>
    </button>
  );
}
