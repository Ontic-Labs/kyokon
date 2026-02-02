/**
 * Route-level API Key Authentication
 *
 * Provides a wrapper for Next.js route handlers that validates API keys
 * against the database. Works around Edge runtime limitations by doing
 * validation at the route level instead of middleware.
 *
 * Usage:
 *   export const GET = withApiKey(async (request, context, apiKey) => {
 *     // apiKey contains the validated key metadata
 *     return NextResponse.json({ data: "..." });
 *   });
 */

import { NextRequest, NextResponse } from "next/server";
import { query } from "./db";
import { hashApiKey, isValidKeyFormat, type ApiKey } from "./api-keys";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<Record<string, string>> };

type AuthenticatedHandler = (
  request: NextRequest,
  context: RouteContext,
  apiKey: ApiKey
) => Promise<NextResponse>;

type UnauthenticatedHandler = (
  request: NextRequest,
  context: RouteContext
) => Promise<NextResponse>;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Check if authentication is required.
 * In development, auth is optional unless REQUIRE_API_KEY=true.
 */
function isAuthRequired(): boolean {
  if (process.env.REQUIRE_API_KEY === "true") return true;
  if (process.env.NODE_ENV === "production") return true;
  return false;
}

/**
 * Check for legacy single API_KEY env var (backward compatibility).
 */
function checkLegacyApiKey(provided: string): boolean {
  const legacyKey = process.env.API_KEY;
  if (!legacyKey) return false;
  return timingSafeEqual(provided, legacyKey);
}

// ---------------------------------------------------------------------------
// Key Extraction
// ---------------------------------------------------------------------------

function extractApiKey(request: NextRequest): string | null {
  return (
    request.headers.get("x-api-key") ??
    request.nextUrl.searchParams.get("apiKey") ??
    null
  );
}

// ---------------------------------------------------------------------------
// Database Validation
// ---------------------------------------------------------------------------

interface DbApiKeyRow {
  id: string;
  key_prefix: string;
  name: string;
  description: string | null;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_by: string | null;
  revoked_by: string | null;
  request_count: string;
}

function rowToApiKey(row: DbApiKeyRow): ApiKey {
  return {
    id: row.id,
    keyPrefix: row.key_prefix,
    name: row.name,
    description: row.description,
    createdAt: new Date(row.created_at),
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
    createdBy: row.created_by,
    revokedBy: row.revoked_by,
    requestCount: Number(row.request_count),
  };
}

async function validateKeyInDatabase(
  plainTextKey: string
): Promise<{ valid: boolean; key?: ApiKey; error?: string }> {
  if (!isValidKeyFormat(plainTextKey)) {
    return { valid: false, error: "Invalid API key format" };
  }

  const keyHash = hashApiKey(plainTextKey);

  try {
    const result = await query<DbApiKeyRow>(
      `SELECT * FROM api_keys WHERE key_hash = $1`,
      [keyHash]
    );

    if (result.rows.length === 0) {
      return { valid: false, error: "Invalid API key" };
    }

    const key = rowToApiKey(result.rows[0]);

    // Check if revoked
    if (key.revokedAt) {
      return { valid: false, key, error: "API key has been revoked" };
    }

    // Check if expired
    if (key.expiresAt && key.expiresAt < new Date()) {
      return { valid: false, key, error: "API key has expired" };
    }

    // Update last_used_at and request_count (fire and forget)
    query(
      `UPDATE api_keys 
       SET last_used_at = NOW(), request_count = request_count + 1 
       WHERE id = $1`,
      [key.id]
    ).catch((err) => console.error("Failed to update key usage:", err));

    return { valid: true, key };
  } catch (err) {
    // Database might not have api_keys table yet (pre-migration)
    // Fall through to legacy key check
    console.warn("API key validation failed (table may not exist):", err);
    return { valid: false, error: "API key validation unavailable" };
  }
}

// ---------------------------------------------------------------------------
// Error Responses
// ---------------------------------------------------------------------------

function unauthorizedResponse(message: string): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "UNAUTHORIZED",
        message,
      },
    },
    { status: 401 }
  );
}

// ---------------------------------------------------------------------------
// Timing-Safe Comparison
// ---------------------------------------------------------------------------

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
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

// ---------------------------------------------------------------------------
// Route Wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap a route handler with API key authentication.
 *
 * In development (without REQUIRE_API_KEY=true), requests without keys are allowed.
 * In production, all requests require a valid API key.
 *
 * The handler receives the validated ApiKey as a third argument.
 */
export function withApiKey(handler: AuthenticatedHandler): UnauthenticatedHandler {
  return async (request: NextRequest, context: RouteContext) => {
    const provided = extractApiKey(request);

    // No key provided
    if (!provided) {
      if (!isAuthRequired()) {
        // Development mode: allow unauthenticated access
        // Pass a dummy key for type compatibility
        const dummyKey: ApiKey = {
          id: "dev-mode",
          keyPrefix: "dev_",
          name: "Development (unauthenticated)",
          description: null,
          createdAt: new Date(),
          expiresAt: null,
          lastUsedAt: null,
          revokedAt: null,
          createdBy: null,
          revokedBy: null,
          requestCount: 0,
        };
        return handler(request, context, dummyKey);
      }
      return unauthorizedResponse(
        "Missing API key. Provide via X-API-Key header or apiKey query parameter."
      );
    }

    // Check legacy single API_KEY first (backward compatibility)
    if (checkLegacyApiKey(provided)) {
      const legacyKey: ApiKey = {
        id: "legacy",
        keyPrefix: provided.slice(0, 8),
        name: "Legacy API Key (env var)",
        description: null,
        createdAt: new Date(),
        expiresAt: null,
        lastUsedAt: new Date(),
        revokedAt: null,
        createdBy: null,
        revokedBy: null,
        requestCount: 0,
      };
      return handler(request, context, legacyKey);
    }

    // Validate against database
    const validation = await validateKeyInDatabase(provided);

    if (!validation.valid) {
      return unauthorizedResponse(validation.error ?? "Invalid API key");
    }

    return handler(request, context, validation.key!);
  };
}

/**
 * Wrap an admin route with ADMIN_SECRET authentication.
 * Used for bootstrapping (creating first API key) and key management.
 */
export function withAdminAuth(handler: UnauthenticatedHandler): UnauthenticatedHandler {
  return async (request: NextRequest, context: RouteContext) => {
    const adminSecret = process.env.ADMIN_SECRET;

    if (!adminSecret) {
      return NextResponse.json(
        {
          error: {
            code: "CONFIGURATION_ERROR",
            message: "ADMIN_SECRET environment variable is not set",
          },
        },
        { status: 500 }
      );
    }

    const provided =
      request.headers.get("x-admin-secret") ??
      request.nextUrl.searchParams.get("adminSecret");

    if (!provided) {
      return unauthorizedResponse(
        "Missing admin secret. Provide via X-Admin-Secret header."
      );
    }

    if (!timingSafeEqual(provided, adminSecret)) {
      return unauthorizedResponse("Invalid admin secret");
    }

    return handler(request, context);
  };
}
