import { NextResponse } from "next/server";

/**
 * API Discovery Endpoint
 * Returns basic API info and available endpoints
 */
export async function GET() {
  return NextResponse.json({
    name: "Kyokon API",
    version: "1.8.0",
    description: "REST API for USDA FoodData Central SR Legacy, Foundation, and Branded foods data",
    endpoints: {
      foods: {
        list: "/api/foods",
        detail: "/api/foods/{fdcId}",
        description: "Search and retrieve food data with nutrients, portions, and cookability"
      },
      categories: {
        list: "/api/categories",
        description: "Food category listing with optional counts"
      },
      nutrients: {
        list: "/api/nutrients",
        description: "Nutrient reference data"
      },
      ingredients: {
        list: "/api/ingredients",
        detail: "/api/ingredients/{slug}",
        resolve: "/api/ingredients/resolve",
        export: "/api/ingredients/export",
        description: "Recipe-first canonical ingredient endpoints"
      },
      canonicals: {
        list: "/api/canonicals",
        detail: "/api/canonicals/{slug}",
        description: "Canonical ingredient aggregates"
      }
    },
    authentication: {
      methods: [
        "Query parameter: ?api_key=YOUR_KEY",
        "Header: X-API-Key: YOUR_KEY",
        "Bearer: Authorization: Bearer YOUR_KEY"
      ],
      getKey: "/docs (click 'Get API Key')"
    },
    links: {
      docs: "/docs",
      openapi: "/api/openapi",
      openapiJson: "/openapi.json"
    }
  });
}
