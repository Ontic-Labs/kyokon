"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface TableFilterBarProps {
  basePath: string;
  queryParam: string;
  queryPlaceholder?: string;
  showHasNutrients?: boolean;
  submitLabel?: string;
}

export default function TableFilterBar({
  basePath,
  queryParam,
  queryPlaceholder = "Search...",
  showHasNutrients = false,
  submitLabel = "Search",
}: TableFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const params = new URLSearchParams(searchParams.toString());

      const q = String(formData.get(queryParam) ?? "").trim();
      if (q) params.set(queryParam, q);
      else params.delete(queryParam);

      if (showHasNutrients) {
        const hasNutrients = formData.get("hasNutrients");
        if (hasNutrients === "true") params.set("hasNutrients", "true");
        else params.delete("hasNutrients");
      }

      params.delete("page");
      const qs = params.toString();
      router.push(qs ? `${basePath}?${qs}` : basePath);
    },
    [basePath, queryParam, router, searchParams, showHasNutrients]
  );

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          name={queryParam}
          defaultValue={searchParams.get(queryParam) ?? ""}
          placeholder={queryPlaceholder}
          className="flex-1 px-3 py-2 bg-surface-raised border border-border-default rounded-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-interactive-focus-ring focus:border-interactive-primary"
        />
        {showHasNutrients && (
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              name="hasNutrients"
              value="true"
              defaultChecked={searchParams.get("hasNutrients") === "true"}
              className="rounded border-border-default"
            />
            Has nutrients
          </label>
        )}
        <button
          type="submit"
          className="px-4 py-2 bg-interactive-primary hover:bg-interactive-primary-hover text-interactive-primary-text rounded-sm text-sm font-medium transition-colors"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
