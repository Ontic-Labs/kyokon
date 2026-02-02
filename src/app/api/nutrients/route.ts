import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleError } from "@/lib/errors";
import { PagingSchema, getOffset, paginate, createPaginatedResponseSchema } from "@/lib/paging";
import { validatedResponse, validateItems } from "@/lib/validate-response";
import { NutrientListItem, NutrientListItemSchema } from "@/types/fdc";

const NutrientsQuerySchema = z
  .object({
    search: z.string().optional(),
  })
  .merge(PagingSchema);

// Response schema for paginated nutrients
const NutrientsResponseSchema = createPaginatedResponseSchema(NutrientListItemSchema);

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const params = NutrientsQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    const { search, page, pageSize } = params;
    const offset = getOffset(page, pageSize);

    let whereClause = "";
    const values: unknown[] = [];

    if (search) {
      whereClause = "WHERE name ILIKE $1";
      values.push(`%${search}%`);
    }

    // Count query
    const countResult = await db.query<{ total: string }>(
      `SELECT COUNT(*) as total FROM nutrients ${whereClause}`,
      values
    );

    // Data query
    const dataResult = await db.query<{
      nutrient_id: number;
      name: string;
      unit_name: string;
      nutrient_rank: number | null;
      is_energy: boolean;
    }>(
      `SELECT 
        nutrient_id,
        name,
        unit_name,
        nutrient_rank,
        is_energy
      FROM nutrients
      ${whereClause}
      ORDER BY nutrient_rank ASC NULLS LAST, name ASC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset]
    );

    const total = parseInt(countResult.rows[0]?.total ?? "0", 10);
    const items: NutrientListItem[] = validateItems(
      NutrientListItemSchema,
      dataResult.rows.map((row) => ({
        nutrientId: row.nutrient_id,
        name: row.name,
        unit: row.unit_name,
        rank: row.nutrient_rank,
        isEnergy: row.is_energy,
      }))
    );

    return validatedResponse(NutrientsResponseSchema, paginate(items, total, page, pageSize));
  } catch (error) {
    return handleError(error);
  }
}
