import { db } from "@/lib/db";
import { getOffset, paginate, PaginatedResponse } from "@/lib/paging";

export interface CanonicalListItem {
  canonicalSlug: string;
  canonicalName: string;
  foodCount: number;
}

export interface CanonicalSearchParams {
  q?: string;
  page?: number;
  pageSize?: number;
}

export async function searchCanonicals(
  params: CanonicalSearchParams
): Promise<PaginatedResponse<CanonicalListItem>> {
  const { q, page = 1, pageSize = 50 } = params;
  const offset = getOffset(page, pageSize);

  const conditions: string[] = ["cn.level = 'base'"];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (q) {
    conditions.push(
      `cn.canonical_name ILIKE '%' || $${paramIndex} || '%'`
    );
    values.push(q);
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const countSql = `
    SELECT COUNT(DISTINCT cn.canonical_slug) as total
    FROM food_canonical_names cn
    ${whereClause}
  `;

  const dataSql = `
    SELECT
      cn.canonical_slug,
      cn.canonical_name,
      COUNT(*) as food_count
    FROM food_canonical_names cn
    ${whereClause}
    GROUP BY cn.canonical_slug, cn.canonical_name
    ORDER BY food_count DESC, cn.canonical_name ASC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  const dataValues = [...values, pageSize, offset];

  const [countResult, dataResult] = await Promise.all([
    db.query<{ total: string }>(countSql, values),
    db.query<{
      canonical_slug: string;
      canonical_name: string;
      food_count: string;
    }>(dataSql, dataValues),
  ]);

  const total = parseInt(countResult.rows[0]?.total ?? "0", 10);
  const items: CanonicalListItem[] = dataResult.rows.map((row) => ({
    canonicalSlug: row.canonical_slug,
    canonicalName: row.canonical_name,
    foodCount: parseInt(row.food_count, 10),
  }));

  return paginate(items, total, page, pageSize);
}
