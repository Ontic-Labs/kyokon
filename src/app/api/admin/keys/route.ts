/**
 * Admin API: List and Create API Keys
 *
 * POST /api/admin/keys - Create a new API key
 * GET  /api/admin/keys - List all API keys
 *
 * Requires ADMIN_SECRET authentication via X-Admin-Secret header.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/auth";
import { query } from "@/lib/db";
import { generateApiKey, hashApiKey, getKeyPrefix } from "@/lib/api-keys";

interface CreateKeyBody {
  name: string;
  description?: string;
  expiresAt?: string; // ISO date string
}

// POST /api/admin/keys - Create a new API key
export const POST = withAdminAuth(async (request: NextRequest) => {
  try {
    const body = (await request.json()) as CreateKeyBody;

    if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "name is required" } },
        { status: 400 }
      );
    }

    const plainTextKey = generateApiKey();
    const keyHash = hashApiKey(plainTextKey);
    const keyPrefix = getKeyPrefix(plainTextKey);

    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    const result = await query(
      `INSERT INTO api_keys (key_hash, key_prefix, name, description, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, key_prefix, name, description, created_at, expires_at`,
      [keyHash, keyPrefix, body.name.trim(), body.description ?? null, expiresAt]
    );

    const row = result.rows[0];

    return NextResponse.json({
      message: "API key created successfully. Save the key below - it won't be shown again!",
      key: plainTextKey,
      metadata: {
        id: row.id,
        keyPrefix: row.key_prefix,
        name: row.name,
        description: row.description,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      },
    });
  } catch (err) {
    console.error("Error creating API key:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Failed to create API key" } },
      { status: 500 }
    );
  }
});

// GET /api/admin/keys - List all API keys
export const GET = withAdminAuth(async (request: NextRequest) => {
  try {
    const includeRevoked = request.nextUrl.searchParams.get("includeRevoked") === "true";

    const result = await query(
      `SELECT id, key_prefix, name, description, created_at, expires_at, 
              last_used_at, revoked_at, created_by, revoked_by, request_count
       FROM api_keys
       ${includeRevoked ? "" : "WHERE revoked_at IS NULL"}
       ORDER BY created_at DESC`
    );

    const keys = result.rows.map((row) => ({
      id: row.id,
      keyPrefix: row.key_prefix,
      name: row.name,
      description: row.description,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
      createdBy: row.created_by,
      revokedBy: row.revoked_by,
      requestCount: Number(row.request_count),
      status: row.revoked_at
        ? "revoked"
        : row.expires_at && new Date(row.expires_at) < new Date()
          ? "expired"
          : "active",
    }));

    return NextResponse.json({ keys, total: keys.length });
  } catch (err) {
    console.error("Error listing API keys:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Failed to list API keys" } },
      { status: 500 }
    );
  }
});
