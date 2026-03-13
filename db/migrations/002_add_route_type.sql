-- =============================================================================
-- IVR Studio Schema Migration — 002
-- Adds the route_type column to ivr_did_routes.
--
-- This column was present in the live database but missing from the original
-- 001_ivr_studio_schema.sql migration file (schema drift from dev).
--
-- Safe to run multiple times (uses IF NOT EXISTS / idempotent guards).
--
-- Usage:
--   psql -h 127.0.0.1 -U fusionpbx -d fusionpbx -f 002_add_route_type.sql
-- =============================================================================

-- Add route_type column if it doesn't already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'ivr_studio'
          AND table_name   = 'ivr_did_routes'
          AND column_name  = 'route_type'
    ) THEN
        ALTER TABLE ivr_studio.ivr_did_routes
            ADD COLUMN route_type TEXT NOT NULL DEFAULT 'both';
    END IF;
END;
$$;

-- Add CHECK constraint if it doesn't already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'ivr_studio.ivr_did_routes'::regclass
          AND conname   = 'ivr_did_routes_route_type_check'
    ) THEN
        ALTER TABLE ivr_studio.ivr_did_routes
            ADD CONSTRAINT ivr_did_routes_route_type_check
            CHECK (route_type IN ('both', 'public', 'internal'));
    END IF;
END;
$$;

-- Ensure grants cover the updated table (safe to re-run)
GRANT SELECT, INSERT, UPDATE, DELETE ON ivr_studio.ivr_did_routes TO fusionpbx;
