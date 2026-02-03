import { NextRequest } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/errors";
import { PagingSchema, createPaginatedResponseSchema } from "@/lib/paging";
import { validatedResponse } from "@/lib/validate-response";
import { searchCanonicals } from "@/lib/data/canonicals";
import { withApiKey } from "@/lib/auth";

const dbInt = z.coerce.number().int();

const CanonicalListItemSchema = z.object({
  canonicalId: dbInt,
  canonicalSlug: z.string(),
  canonicalName: z.string(),
  foodCount: dbInt,
});

const CanonicalsResponseSchema =
  createPaginatedResponseSchema(CanonicalListItemSchema);

const CanonicalsQuerySchema = z
  .object({
    q: z.string().optional(),
    sortBy: z.enum(["name", "foods", "id"]).optional(),
    sortDir: z.enum(["asc", "desc"]).optional(),
  })
  .merge(PagingSchema);

export const GET = withApiKey(async (request: NextRequest) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const params = CanonicalsQuerySchema.parse({
      q: searchParams.get("q") ?? undefined,
      sortBy: searchParams.get("sortBy") ?? undefined,
      sortDir: searchParams.get("sortDir") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    const result = await searchCanonicals(params);
    return validatedResponse(CanonicalsResponseSchema, result);
  } catch (error) {
    return handleError(error);
  }
});
