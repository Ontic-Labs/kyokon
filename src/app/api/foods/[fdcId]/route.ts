import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, handleError } from "@/lib/errors";
import { validatedResponse } from "@/lib/validate-response";
import { FoodDetailSchema } from "@/types/fdc";
import { getFoodDetail } from "@/lib/data/foods";
import { withApiKey } from "@/lib/auth";

const ParamsSchema = z.object({
  fdcId: z.coerce.number().int().positive(),
});

const QuerySchema = z.object({
  include: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()) : ["nutrients", "portions"])),
});

export const GET = withApiKey(async (
  request: NextRequest,
  { params }: { params: Promise<{ fdcId: string }> }
) => {
  try {
    const { fdcId } = ParamsSchema.parse(await params);
    const searchParams = request.nextUrl.searchParams;
    const { include } = QuerySchema.parse({
      include: searchParams.get("include") ?? undefined,
    });

    const food = await getFoodDetail(fdcId, {
      includeNutrients: include.includes("nutrients"),
      includePortions: include.includes("portions"),
    });

    if (!food) {
      return errorResponse("NOT_FOUND", `Food with fdcId ${fdcId} not found`);
    }

    return validatedResponse(FoodDetailSchema, food);
  } catch (error) {
    return handleError(error);
  }
});
