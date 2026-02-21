-- =============================================================================
-- IVR Studio Schema Migration
-- Run against FusionPBX's existing PostgreSQL database.
-- Creates a dedicated 'ivr_studio' schema — zero conflict with public.* tables.
-- =============================================================================
-- Usage: psql -U fusionpbx -d fusionpbx -f 001_ivr_studio_schema.sql
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS ivr_studio;

-- ---------------------------------------------------------------------------
-- IVR FLOWS
-- domain_uuid = public.v_domains.domain_uuid (FusionPBX tenant identifier)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ivr_studio.ivr_flows (
    flow_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_uuid      UUID        NOT NULL,
    name             TEXT        NOT NULL,
    description      TEXT,
    draft_graph      JSONB,
    draft_updated_at TIMESTAMPTZ,
    created_by       UUID,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted       BOOLEAN     NOT NULL DEFAULT FALSE,
    UNIQUE(domain_uuid, name)
);

CREATE INDEX IF NOT EXISTS idx_ivr_flows_domain
    ON ivr_studio.ivr_flows(domain_uuid)
    WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_ivr_flows_draft_graph
    ON ivr_studio.ivr_flows USING GIN(draft_graph);

-- ---------------------------------------------------------------------------
-- IVR VERSIONS
-- Immutable rows. Exactly one 'published' per flow enforced by partial unique index.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ivr_studio.ivr_versions (
    version_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id         UUID        NOT NULL
                    REFERENCES ivr_studio.ivr_flows(flow_id) ON DELETE CASCADE,
    domain_uuid     UUID        NOT NULL,
    version_number  INTEGER     NOT NULL,
    status          TEXT        NOT NULL DEFAULT 'archived'
                    CHECK (status IN ('published', 'archived')),
    execution_graph JSONB       NOT NULL,
    raw_graph       JSONB       NOT NULL,
    published_by    UUID,
    published_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checksum        TEXT        NOT NULL,
    UNIQUE(flow_id, version_number)
);

-- Enforces single published version per flow at DB level
CREATE UNIQUE INDEX IF NOT EXISTS idx_ivr_versions_one_published
    ON ivr_studio.ivr_versions(flow_id)
    WHERE status = 'published';

-- Hot path: Lua looks up by domain_uuid + flow_id + status='published'
CREATE INDEX IF NOT EXISTS idx_ivr_versions_published_lookup
    ON ivr_studio.ivr_versions(domain_uuid, flow_id)
    WHERE status = 'published';

-- ---------------------------------------------------------------------------
-- DID → FLOW ROUTING
-- Maps an inbound destination_number (as seen in FusionPBX) to an IVR flow.
-- FusionPBX routes the DID to our Lua script; Lua reads this table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ivr_studio.ivr_did_routes (
    route_id    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_uuid UUID    NOT NULL,
    destination TEXT    NOT NULL,
    flow_id     UUID    NOT NULL
                REFERENCES ivr_studio.ivr_flows(flow_id) ON DELETE CASCADE,
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(domain_uuid, destination)
);

-- Hot path: one query per inbound call
CREATE INDEX IF NOT EXISTS idx_ivr_did_routes_lookup
    ON ivr_studio.ivr_did_routes(domain_uuid, destination)
    WHERE enabled;

-- ---------------------------------------------------------------------------
-- FLOW SECRETS
-- API tokens / credentials referenced in node configs as {{secret:key_name}}
-- Values are AES-256-GCM encrypted; key held in FreeSWITCH global variable.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ivr_studio.flow_secrets (
    secret_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_uuid     UUID        NOT NULL,
    key_name        TEXT        NOT NULL,
    encrypted_value TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(domain_uuid, key_name)
);

-- ---------------------------------------------------------------------------
-- CALL LOGS
-- Written by the API server (async insert, not blocking Lua execution).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ivr_studio.call_logs (
    log_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id    UUID        NOT NULL,
    domain_uuid UUID        NOT NULL,
    flow_id     UUID        NOT NULL,
    version_id  UUID        NOT NULL,
    call_uuid   TEXT        NOT NULL,
    ani         TEXT,
    dnis        TEXT,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at    TIMESTAMPTZ,
    disposition TEXT,
    node_trace  JSONB       NOT NULL DEFAULT '[]',
    api_calls   JSONB       NOT NULL DEFAULT '[]',
    error_log   JSONB       NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_call_logs_domain_date
    ON ivr_studio.call_logs(domain_uuid, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_logs_call_uuid
    ON ivr_studio.call_logs(call_uuid);

CREATE INDEX IF NOT EXISTS idx_call_logs_trace
    ON ivr_studio.call_logs(trace_id);

CREATE INDEX IF NOT EXISTS idx_call_logs_flow
    ON ivr_studio.call_logs(flow_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- GRANT ACCESS to FusionPBX DB user (used by freeswitch.Dbh and app server)
-- Replace 'fusionpbx' with your actual DB user if different.
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA ivr_studio TO fusionpbx;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ivr_studio TO fusionpbx;
ALTER DEFAULT PRIVILEGES IN SCHEMA ivr_studio
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fusionpbx;

-- ---------------------------------------------------------------------------
-- UPDATED_AT trigger helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ivr_studio.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ivr_flows_updated_at
    BEFORE UPDATE ON ivr_studio.ivr_flows
    FOR EACH ROW EXECUTE FUNCTION ivr_studio.set_updated_at();

CREATE TRIGGER trg_flow_secrets_updated_at
    BEFORE UPDATE ON ivr_studio.flow_secrets
    FOR EACH ROW EXECUTE FUNCTION ivr_studio.set_updated_at();
