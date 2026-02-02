-- Migration 010: API Keys
-- Production-grade API key management with hashing, expiration, and revocation.

-- API keys table
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Key identification: store hash for security, prefix for display
    key_hash TEXT NOT NULL UNIQUE,        -- SHA-256 hash of full key
    key_prefix VARCHAR(12) NOT NULL,      -- First 8 chars of key (e.g., "kyo_a1b2")
    
    -- Metadata
    name VARCHAR(255) NOT NULL,           -- Human-readable name (e.g., "Mobile App", "Partner API")
    description TEXT,                     -- Optional notes
    
    -- Lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,               -- NULL = never expires
    last_used_at TIMESTAMPTZ,             -- Updated on each successful auth
    revoked_at TIMESTAMPTZ,               -- NULL = active, set when revoked
    
    -- Audit
    created_by VARCHAR(255),              -- Email or identifier of creator
    revoked_by VARCHAR(255),              -- Email or identifier of revoker
    
    -- Usage tracking
    request_count BIGINT NOT NULL DEFAULT 0,
    
    -- Constraints
    CONSTRAINT api_keys_name_not_empty CHECK (LENGTH(TRIM(name)) > 0)
);

-- Indexes for efficient lookups
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_active ON api_keys(revoked_at) WHERE revoked_at IS NULL;

-- Comments
COMMENT ON TABLE api_keys IS 'API key storage with secure hashing. Keys are shown once at creation, then only prefix is visible.';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hash of the full API key. Original key is not stored.';
COMMENT ON COLUMN api_keys.key_prefix IS 'First 8 characters of key for identification (e.g., kyo_a1b2). Safe to display.';
COMMENT ON COLUMN api_keys.request_count IS 'Total number of successful API requests made with this key.';
