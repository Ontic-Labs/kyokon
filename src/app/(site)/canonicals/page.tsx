import Link from "next/link";
import { searchCanonicals } from "@/lib/data/canonicals";
import CanonicalSearchForm from "@/components/canonical-search-form";
import Pagination from "@/components/pagination";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Canonical Names | Kyokon",
};

export default async function CanonicalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;

  const results = await searchCanonicals({
    q: params.q || undefined,
    page: params.page ? Number(params.page) : 1,
    pageSize: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          Canonical Names
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {results.total.toLocaleString()} unique base identities extracted from
          food descriptions
        </p>
      </div>

      <CanonicalSearchForm />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {results.items.map((item) => (
          <Link
            key={item.canonicalSlug}
            href={`/foods?canonicalSlug=${item.canonicalSlug}`}
            className="block p-4 bg-surface-raised border border-border-default rounded-md hover:border-border-strong transition-colors"
          >
            <div className="text-sm font-medium text-text-primary">
              {item.canonicalName}
            </div>
            <div className="text-sm text-text-muted mt-1">
              {item.foodCount.toLocaleString()} foods
            </div>
          </Link>
        ))}
      </div>

      {results.items.length === 0 && (
        <div className="text-center py-12 text-text-muted">
          No canonical names found matching your search.
        </div>
      )}

      <Pagination
        total={results.total}
        page={results.page}
        pageSize={results.pageSize}
      />
    </div>
  );
}
