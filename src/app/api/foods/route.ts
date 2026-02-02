import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleError } from "@/lib/errors";
import { PagingSchema, getOffset, paginate, createPaginatedResponseSchema } from "@/lib/paging";
import { validatedResponse, validateItems } from "@/lib/validate-response";
import { FoodListItem, FoodListItemSchema } from "@/types/fdc";

// Response schema for paginated foods
const FoodsResponseSchema = createPaginatedResponseSchema(FoodListItemSchema);

const FoodsQuerySchema = z
  .object({
    q: z.string().optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    nutrientId: z.coerce.number().int().positive().optional(),
    min: z.coerce.number().optional(),
    max: z.coerce.number().optional(),
    cookable: z
      .enum(["true", "false", "1", "0"])
      .optional()
      .transform((v) => (v === "true" || v === "1" ? true : v === "false" || v === "0" ? false : undefined)),
    state: z.enum(["unknown", "raw", "cooked"]).optional(),
    preservation: z
      .enum([
        "unknown", "fresh", "frozen", "canned", "dried", "cured",
        "pickled", "fermented", "smoked",
      ])
      .optional(),
    processing: z
      .enum([
        "unknown", "whole", "ground", "sliced", "diced", "shredded",
        "pureed", "paste", "powder", "flour", "juice", "oil",
        "broth", "stock",
      ])
      .optional(),
  })
  .merge(PagingSchema);

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const params = FoodsQuerySchema.parse({
      q: searchParams.get("q") ?? undefined,
      categoryId: searchParams.get("categoryId") ?? undefined,
      nutrientId: searchParams.get("nutrientId") ?? undefined,
      min: searchParams.get("min") ?? undefined,
      max: searchParams.get("max") ?? undefined,
      cookable: searchParams.get("cookable") ?? undefined,
      state: searchParams.get("state") ?? undefined,
      preservation: searchParams.get("preservation") ?? undefined,
      processing: searchParams.get("processing") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    const { q, categoryId, nutrientId, min, max, cookable, state, preservation, processing, page, pageSize } = params;
    const offset = getOffset(page, pageSize);

    // Build query dynamically
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    // Full-text search
    let orderBy = "f.description ASC";
    let selectRank = "";
    if (q) {
      conditions.push(`f.description_tsv @@ plainto_tsquery('simple', $${paramIndex})`);
      selectRank = `, ts_rank(f.description_tsv, plainto_tsquery('simple', $${paramIndex})) AS rank`;
      orderBy = "rank DESC, f.description ASC";
      values.push(q);
      paramIndex++;
    }

    // Category filter
    if (categoryId) {
      conditions.push(`f.category_id = $${paramIndex}`);
      values.push(categoryId);
      paramIndex++;
    }

    // Nutrient filter (requires join)
    let nutrientJoin = "";
    if (nutrientId) {
      nutrientJoin = `INNER JOIN food_nutrients fn ON f.fdc_id = fn.fdc_id AND fn.nutrient_id = $${paramIndex}`;
      values.push(nutrientId);
      paramIndex++;

      if (min !== undefined) {
        conditions.push(`fn.amount >= $${paramIndex}`);
        values.push(min);
        paramIndex++;
      }
      if (max !== undefined) {
        conditions.push(`fn.amount <= $${paramIndex}`);
        values.push(max);
        paramIndex++;
      }
    }

    // Cookability filter (requires join to assessment table)
    let cookabilityJoin = "";
    if (cookable !== undefined) {
      cookabilityJoin = `INNER JOIN fdc_cookability_assessment ca ON f.fdc_id = ca.fdc_id`;
      conditions.push(`ca.is_cookable = $${paramIndex}`);
      values.push(cookable);
      paramIndex++;
    }

    // Food state filters (share a single join)
    let stateJoin = "";
    if (state !== undefined || preservation !== undefined || processing !== undefined) {
      stateJoin = `INNER JOIN food_state fs ON f.fdc_id = fs.fdc_id`;
      if (state !== undefined) {
        conditions.push(`fs.cooking_state = $${paramIndex}`);
        values.push(state);
        paramIndex++;
      }
      if (preservation !== undefined) {
        conditions.push(`fs.preservation = $${paramIndex}`);
        values.push(preservation);
        paramIndex++;
      }
      if (processing !== undefined) {
        conditions.push(`fs.processing = $${paramIndex}`);
        values.push(processing);
        paramIndex++;
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count query
    const countSql = `
      SELECT COUNT(DISTINCT f.fdc_id) as total
      FROM foods f
      ${nutrientJoin}
      ${cookabilityJoin}
      ${stateJoin}
      ${whereClause}
    `;

    // Include food state fields when the join is active
    const stateSelect = stateJoin
      ? `, fs.cooking_state, fs.cooking_methods, fs.preservation, fs.processing`
      : "";

    // Data query
    const dataSql = `
      SELECT DISTINCT
        f.fdc_id,
        f.description,
        f.category_id,
        c.name as category_name
        ${stateSelect}
        ${selectRank}
      FROM foods f
      LEFT JOIN food_categories c ON f.category_id = c.category_id
      ${nutrientJoin}
      ${cookabilityJoin}
      ${stateJoin}
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataValues = [...values, pageSize, offset];

    const [countResult, dataResult] = await Promise.all([
      db.query<{ total: string }>(countSql, values),
      db.query<{
        fdc_id: number;
        description: string;
        category_id: number | null;
        category_name: string | null;
        cooking_state?: string;
        cooking_methods?: string[];
        preservation?: string;
        processing?: string;
      }>(dataSql, dataValues),
    ]);

    const total = parseInt(countResult.rows[0]?.total ?? "0", 10);
    const rawItems = dataResult.rows.map((row) => ({
      fdcId: row.fdc_id,
      description: row.description,
      categoryId: row.category_id,
      categoryName: row.category_name ?? undefined,
      ...(row.cooking_state !== undefined && {
        cookingState: row.cooking_state,
        cookingMethods: row.cooking_methods,
        preservation: row.preservation,
        processing: row.processing,
      }),
    }));

    // Validate each item against schema
    const items: FoodListItem[] = validateItems(FoodListItemSchema, rawItems);

    return validatedResponse(FoodsResponseSchema, paginate(items, total, page, pageSize));
  } catch (error) {
    return handleError(error);
  }
}
