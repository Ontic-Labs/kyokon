import { z } from "zod";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const PagingSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});

export type PagingParams = z.infer<typeof PagingSchema>;

/**
 * Create a paginated response schema for a given item schema
 */
export function createPaginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
    total: z.number().int().nonnegative(),
    items: z.array(itemSchema),
  });
}

export interface PaginatedResponse<T> {
  page: number;
  pageSize: number;
  total: number;
  items: T[];
}

/**
 * Calculate offset from page and pageSize
 */
export function getOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

/**
 * Create a paginated response object
 */
export function paginate<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number
): PaginatedResponse<T> {
  return {
    page,
    pageSize,
    total,
    items,
  };
}
