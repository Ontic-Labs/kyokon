import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleError } from "@/lib/errors";
import { validatedResponse, validateItems } from "@/lib/validate-response";
import {
  CategoryWithCount,
  CategoryWithCountSchema,
  CategoryInfo,
  CategoryInfoSchema,
  CategoriesResponseSchema,
  CategoriesWithCountResponseSchema,
} from "@/types/fdc";

const CategoriesQuerySchema = z.object({
  includeCounts: z.coerce.boolean().optional().default(false),
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const params = CategoriesQuerySchema.parse({
      includeCounts: searchParams.get("includeCounts") ?? undefined,
    });

    const { includeCounts } = params;

    if (includeCounts) {
      const result = await db.query<{
        category_id: number;
        name: string;
        food_count: string;
      }>(
        `SELECT 
          c.category_id,
          c.name,
          COUNT(f.fdc_id) as food_count
        FROM food_categories c
        LEFT JOIN foods f ON c.category_id = f.category_id
        GROUP BY c.category_id, c.name
        ORDER BY c.name ASC`
      );

      const categories: CategoryWithCount[] = validateItems(
        CategoryWithCountSchema,
        result.rows.map((row) => ({
          categoryId: row.category_id,
          name: row.name,
          foodCount: parseInt(row.food_count, 10),
        }))
      );

      return validatedResponse(CategoriesWithCountResponseSchema, { categories });
    }

    const result = await db.query<{
      category_id: number;
      name: string;
    }>(
      `SELECT category_id, name
      FROM food_categories
      ORDER BY name ASC`
    );

    const categories: CategoryInfo[] = validateItems(
      CategoryInfoSchema,
      result.rows.map((row) => ({
        categoryId: row.category_id,
        name: row.name,
      }))
    );

    return validatedResponse(CategoriesResponseSchema, { categories });
  } catch (error) {
    return handleError(error);
  }
}
