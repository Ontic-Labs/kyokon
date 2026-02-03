"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export default function IngredientSearchForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      const params = new URLSearchParams(searchParams.toString());

      const q = String(formData.get("q") ?? "").trim();
      if (q) params.set("q", q);
      else params.delete("q");

      const hasNutrients = formData.get("hasNutrients");
      if (hasNutrients === "true") params.set("hasNutrients", "true");
      else params.delete("hasNutrients");

      params.delete("page");
      const qs = params.toString();
      router.push(qs ? `/ingredients?${qs}` : "/ingredients");
    },
    [router, searchParams]
  );

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          name="q"
          defaultValue={searchParams.get("q") ?? ""}
          placeholder="Search ingredients (e.g., ground beef, olive oil)..."
          className="flex-1 px-3 py-2 bg-surface-raised border border-border-default rounded-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-interactive-focus-ring focus:border-interactive-primary"
        />
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
        <button
          type="submit"
          className="px-4 py-2 bg-interactive-primary hover:bg-interactive-primary-hover text-interactive-primary-text rounded-sm text-sm font-medium transition-colors"
        >
          Search
        </button>
      </div>
    </form>
  );
}
