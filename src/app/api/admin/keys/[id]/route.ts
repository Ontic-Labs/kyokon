/**
 * Admin API: Single API Key Operations
 *
 * GET    /api/admin/keys/[id] - Get key details
 * PATCH  /api/admin/keys/[id] - Update key metadata
 * DELETE /api/admin/keys/[id] - Revoke key
 *
 * Requires ADMIN_SECRET authentication via X-Admin-Secret header.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/auth";
import { query } from "@/lib/db";

// GET /api/admin/keys/[id] - Get key details
export const GET = withAdminAuth(async (_request: NextRequest, context) => {
  const { id } = await context.params;

  try {
    const result = await query(
      `SELECT id, key_prefix, name, description, created_at, expires_at,
              last_used_at, revoked_at, created_by, revoked_by, request_count
       FROM api_keys WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "API key not found" } },
        { status: 404 }
      );
    }

    const row = result.rows[0];
    return NextResponse.json({
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
    });
  } catch (err) {
    console.error("Error getting API key:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Failed to get API key" } },
      { status: 500 }
    );
  }
});

// PATCH /api/admin/keys/[id] - Update key metadata
export const PATCH = withAdminAuth(async (request: NextRequest, context) => {
  const { id } = await context.params;

  try {
    const body = await request.json();
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim().length === 0) {
        return NextResponse.json(
          { error: { code: "BAD_REQUEST", message: "name must be a non-empty string" } },
          { status: 400 }
        );
      }
      updates.push(`name = $${paramIndex++}`);
      values.push(body.name.trim());
    }

    if (body.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(body.description);
    }

    if (body.expiresAt !== undefined) {
      updates.push(`expires_at = $${paramIndex++}`);
      values.push(body.expiresAt ? new Date(body.expiresAt) : null);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "No fields to update" } },
        { status: 400 }
      );
    }

    values.push(id);
    const result = await query(
      `UPDATE api_keys SET ${updates.join(", ")} 
       WHERE id = $${paramIndex}
       RETURNING id, key_prefix, name, description, created_at, expires_at,
                 last_used_at, revoked_at, request_count`,
      values
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "API key not found" } },
        { status: 404 }
      );
    }

    const row = result.rows[0];
    return NextResponse.json({
      message: "API key updated",
      key: {
        id: row.id,
        keyPrefix: row.key_prefix,
        name: row.name,
        description: row.description,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        lastUsedAt: row.last_used_at,
        revokedAt: row.revoked_at,
        requestCount: Number(row.request_count),
      },
    });
  } catch (err) {
    console.error("Error updating API key:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Failed to update API key" } },
      { status: 500 }
    );
  }
});

// DELETE /api/admin/keys/[id] - Revoke key (soft delete)
export const DELETE = withAdminAuth(async (_request: NextRequest, context) => {
  const { id } = await context.params;

  try {
    const result = await query(
      `UPDATE api_keys SET revoked_at = NOW()
       WHERE id = $1 AND revoked_at IS NULL
       RETURNING id, key_prefix, name`,
      [id]
    );

    if (result.rows.length === 0) {
      // Check if key exists but is already revoked
      const existing = await query(`SELECT id, revoked_at FROM api_keys WHERE id = $1`, [id]);
      if (existing.rows.length === 0) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "API key not found" } },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "API key is already revoked" } },
        { status: 400 }
      );
    }

    const row = result.rows[0];
    return NextResponse.json({
      message: "API key revoked",
      key: {
        id: row.id,
        keyPrefix: row.key_prefix,
        name: row.name,
      },
    });
  } catch (err) {
    console.error("Error revoking API key:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Failed to revoke API key" } },
      { status: 500 }
    );
  }
});
