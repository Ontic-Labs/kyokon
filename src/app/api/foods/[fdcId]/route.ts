import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { errorResponse, handleError } from "@/lib/errors";
import { validatedResponse, validateItems } from "@/lib/validate-response";
import {
  FoodDetail,
  FoodDetailSchema,
  NutrientInfo,
  NutrientInfoSchema,
  PortionInfo,
  PortionInfoSchema,
  CategoryInfo,
  CategoryInfoSchema,
} from "@/types/fdc";

const ParamsSchema = z.object({
  fdcId: z.coerce.number().int().positive(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fdcId: string }> }
) {
  try {
    const { fdcId } = ParamsSchema.parse(await params);

    // Get food with category
    const foodResult = await db.query<{
      fdc_id: number;
      description: string;
      data_type: string;
      published_date: Date | null;
      category_id: number | null;
      category_name: string | null;
    }>(
      `SELECT 
        f.fdc_id,
        f.description,
        f.data_type,
        f.published_date,
        f.category_id,
        c.name as category_name
      FROM foods f
      LEFT JOIN food_categories c ON f.category_id = c.category_id
      WHERE f.fdc_id = $1`,
      [fdcId]
    );

    if (foodResult.rows.length === 0) {
      return errorResponse("NOT_FOUND", `Food with fdcId ${fdcId} not found`);
    }

    const food = foodResult.rows[0];

    // Get nutrients
    const nutrientsResult = await db.query<{
      nutrient_id: number;
      name: string;
      unit_name: string;
      amount: number;
    }>(
      `SELECT 
        n.nutrient_id,
        n.name,
        n.unit_name,
        fn.amount
      FROM food_nutrients fn
      INNER JOIN nutrients n ON fn.nutrient_id = n.nutrient_id
      WHERE fn.fdc_id = $1
      ORDER BY n.nutrient_rank ASC NULLS LAST, n.name ASC`,
      [fdcId]
    );

    // Get portions
    const portionsResult = await db.query<{
      gram_weight: number;
      amount: number | null;
      unit_name: string | null;
      modifier: string | null;
    }>(
      `SELECT 
        fp.gram_weight,
        fp.amount,
        mu.name as unit_name,
        fp.modifier
      FROM food_portions fp
      LEFT JOIN measure_units mu ON fp.measure_unit_id = mu.measure_unit_id
      WHERE fp.fdc_id = $1
      ORDER BY fp.sequence_number ASC NULLS LAST`,
      [fdcId]
    );

    // Build response
    const categoryRaw = food.category_id && food.category_name
      ? { categoryId: food.category_id, name: food.category_name }
      : null;
    const category: CategoryInfo | null = categoryRaw
      ? CategoryInfoSchema.parse(categoryRaw)
      : null;

    const nutrients: NutrientInfo[] = validateItems(
      NutrientInfoSchema,
      nutrientsResult.rows.map((row) => ({
        nutrientId: row.nutrient_id,
        name: row.name,
        unit: row.unit_name,
        amount: row.amount,
      }))
    );

    const portions: PortionInfo[] = validateItems(
      PortionInfoSchema,
      portionsResult.rows.map((row) => ({
        gramWeight: row.gram_weight,
        amount: row.amount,
        unit: row.unit_name,
        modifier: row.modifier,
      }))
    );

    const response: FoodDetail = {
      fdcId: food.fdc_id,
      description: food.description,
      dataType: food.data_type,
      publishedDate: food.published_date?.toISOString().split("T")[0] ?? null,
      category,
      nutrients,
      portions,
    };

    return validatedResponse(FoodDetailSchema, response);
  } catch (error) {
    return handleError(error);
  }
}
