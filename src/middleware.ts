import { NextRequest, NextResponse } from "next/server";

/**
 * API key authentication middleware.
 *
 * Gates all /api/* routes. The key is read from the `X-API-Key` header
 * or the `apiKey` query parameter (header preferred).
 *
 * Set the `API_KEY` environment variable to enable. If `API_KEY` is not
 * set, all requests are allowed (development convenience).
 */
export function middleware(request: NextRequest) {
  const apiKey = process.env.API_KEY;

  // If no API_KEY configured, skip auth (development mode)
  if (!apiKey) {
    return NextResponse.next();
  }

  const provided =
    request.headers.get("x-api-key") ??
    request.nextUrl.searchParams.get("apiKey");

  if (!provided) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Missing API key. Provide via X-API-Key header or apiKey query parameter.",
        },
      },
      { status: 401 }
    );
  }

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(provided, apiKey)) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid API key.",
        },
      },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

/**
 * Constant-time string comparison.
 * Prevents timing side-channel attacks on API key validation.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a full comparison to avoid leaking length info via timing
    let result = a.length ^ b.length;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ (b.charCodeAt(i % b.length) || 0);
    }
    return result === 0;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Only run middleware on API routes
export const config = {
  matcher: "/api/:path*",
};
