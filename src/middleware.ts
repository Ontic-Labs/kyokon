import { NextRequest, NextResponse } from "next/server";

/**
 * Minimal middleware for API routes.
 *
 * Authentication is handled at the route level via withApiKey() wrapper
 * in src/lib/auth.ts, which supports database-backed API keys.
 *
 * This middleware only handles CORS and request logging.
 */
export function middleware(request: NextRequest) {
  // Add CORS headers for API routes
  const response = NextResponse.next();

  // Allow requests from any origin (adjust for production if needed)
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-API-Key, X-Admin-Secret"
  );

  // Handle preflight requests
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 200, headers: response.headers });
  }

  return response;
}

// Only run middleware on API routes
export const config = {
  matcher: "/api/:path*",
};
