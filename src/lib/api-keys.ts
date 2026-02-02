/**
 * API Key Management Library
 *
 * Production-grade API key generation, validation, and management.
 * Keys are prefixed with "kyo_" and hashed with SHA-256 before storage.
 */

import { createHash, randomBytes } from "crypto";
import { Pool } from "pg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiKey {
  id: string;
  keyPrefix: string;
  name: string;
  description: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdBy: string | null;
  revokedBy: string | null;
  requestCount: number;
}

export interface CreateKeyOptions {
  name: string;
  description?: string;
  expiresAt?: Date | null;
  createdBy?: string;
}

export interface CreateKeyResult {
  key: ApiKey;
  /** The full API key - shown only once at creation! */
  plainTextKey: string;
}

export interface ValidateKeyResult {
  valid: boolean;
  key?: ApiKey;
  error?: "invalid" | "expired" | "revoked";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KEY_PREFIX = "kyo_";
const KEY_BYTES = 24; // 24 bytes = 48 hex chars, total key = 52 chars with prefix
const PREFIX_LENGTH = 8; // Characters to store for identification (includes "kyo_")

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Generate a secure random API key.
 * Format: kyo_<48 hex characters>
 */
export function generateApiKey(): string {
  const bytes = randomBytes(KEY_BYTES);
  return KEY_PREFIX + bytes.toString("hex");
}

/**
 * Hash an API key for secure storage.
 * Uses SHA-256 for fast validation while remaining secure.
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Extract the displayable prefix from a key.
 * Returns first 8 characters (e.g., "kyo_a1b2").
 */
export function getKeyPrefix(key: string): string {
  return key.slice(0, PREFIX_LENGTH);
}

/**
 * Validate key format (doesn't check database).
 */
export function isValidKeyFormat(key: string): boolean {
  // kyo_ + 48 hex chars = 52 total
  return /^kyo_[a-f0-9]{48}$/i.test(key);
}

// ---------------------------------------------------------------------------
// Database operations
// ---------------------------------------------------------------------------

function rowToApiKey(row: Record<string, unknown>): ApiKey {
  return {
    id: row.id as string,
    keyPrefix: row.key_prefix as string,
    name: row.name as string,
    description: row.description as string | null,
    createdAt: new Date(row.created_at as string),
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at as string) : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at as string) : null,
    createdBy: row.created_by as string | null,
    revokedBy: row.revoked_by as string | null,
    requestCount: Number(row.request_count),
  };
}

/**
 * Create a new API key.
 * Returns both the key metadata and the plain text key (shown only once).
 */
export async function createApiKey(
  pool: Pool,
  options: CreateKeyOptions
): Promise<CreateKeyResult> {
  const plainTextKey = generateApiKey();
  const keyHash = hashApiKey(plainTextKey);
  const keyPrefix = getKeyPrefix(plainTextKey);

  const result = await pool.query(
    `INSERT INTO api_keys (key_hash, key_prefix, name, description, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      keyHash,
      keyPrefix,
      options.name,
      options.description ?? null,
      options.expiresAt ?? null,
      options.createdBy ?? null,
    ]
  );

  return {
    key: rowToApiKey(result.rows[0]),
    plainTextKey,
  };
}

/**
 * Validate an API key and update last_used_at if valid.
 * Returns validation result with key metadata if valid.
 */
export async function validateApiKey(
  pool: Pool,
  plainTextKey: string
): Promise<ValidateKeyResult> {
  if (!isValidKeyFormat(plainTextKey)) {
    return { valid: false, error: "invalid" };
  }

  const keyHash = hashApiKey(plainTextKey);

  const result = await pool.query(
    `SELECT * FROM api_keys WHERE key_hash = $1`,
    [keyHash]
  );

  if (result.rows.length === 0) {
    return { valid: false, error: "invalid" };
  }

  const key = rowToApiKey(result.rows[0]);

  // Check if revoked
  if (key.revokedAt) {
    return { valid: false, key, error: "revoked" };
  }

  // Check if expired
  if (key.expiresAt && key.expiresAt < new Date()) {
    return { valid: false, key, error: "expired" };
  }

  // Update last_used_at and request_count
  await pool.query(
    `UPDATE api_keys 
     SET last_used_at = NOW(), request_count = request_count + 1 
     WHERE id = $1`,
    [key.id]
  );

  return { valid: true, key };
}

/**
 * List all API keys (with optional filtering).
 */
export async function listApiKeys(
  pool: Pool,
  options?: { includeRevoked?: boolean }
): Promise<ApiKey[]> {
  const includeRevoked = options?.includeRevoked ?? false;

  const result = await pool.query(
    `SELECT * FROM api_keys 
     ${includeRevoked ? "" : "WHERE revoked_at IS NULL"}
     ORDER BY created_at DESC`
  );

  return result.rows.map(rowToApiKey);
}

/**
 * Get a single API key by ID.
 */
export async function getApiKey(pool: Pool, id: string): Promise<ApiKey | null> {
  const result = await pool.query(`SELECT * FROM api_keys WHERE id = $1`, [id]);
  return result.rows.length > 0 ? rowToApiKey(result.rows[0]) : null;
}

/**
 * Revoke an API key.
 */
export async function revokeApiKey(
  pool: Pool,
  id: string,
  revokedBy?: string
): Promise<ApiKey | null> {
  const result = await pool.query(
    `UPDATE api_keys 
     SET revoked_at = NOW(), revoked_by = $2
     WHERE id = $1 AND revoked_at IS NULL
     RETURNING *`,
    [id, revokedBy ?? null]
  );

  return result.rows.length > 0 ? rowToApiKey(result.rows[0]) : null;
}

/**
 * Delete an API key permanently.
 * Use with caution - prefer revocation for audit trail.
 */
export async function deleteApiKey(pool: Pool, id: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM api_keys WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Update API key metadata (name, description, expiration).
 */
export async function updateApiKey(
  pool: Pool,
  id: string,
  updates: { name?: string; description?: string; expiresAt?: Date | null }
): Promise<ApiKey | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    sets.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    sets.push(`description = $${paramIndex++}`);
    values.push(updates.description);
  }
  if (updates.expiresAt !== undefined) {
    sets.push(`expires_at = $${paramIndex++}`);
    values.push(updates.expiresAt);
  }

  if (sets.length === 0) {
    return getApiKey(pool, id);
  }

  values.push(id);
  const result = await pool.query(
    `UPDATE api_keys SET ${sets.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return result.rows.length > 0 ? rowToApiKey(result.rows[0]) : null;
}
