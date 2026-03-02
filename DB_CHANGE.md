# IVR Studio — FusionPBX Database Changes

This document describes all database changes required for the IVR Studio system. The IVR Studio schema is **isolated** in its own PostgreSQL schema (`ivr_studio`) and does not modify existing FusionPBX tables. Dialplan entries are written to FusionPBX's `public.v_dialplans` (or equivalent) by the API when DIDs are assigned; see the API and SERVER_CHANGES.md for that behavior.

---

## 1. Schema and migration

- **Database:** FusionPBX's existing PostgreSQL database (typically `fusionpbx`).
- **Schema:** `ivr_studio` (created if not exists).
- **Migration file:** `db/migrations/001_ivr_studio_schema.sql`

**Apply migration:**
```bash
# From project root, using FusionPBX DB credentials
psql -h 127.0.0.1 -U fusionpbx -d fusionpbx -f db/migrations/001_ivr_studio_schema.sql
```

Or use the API server's migrate script if configured:
```bash
cd api-server && node scripts/migrate.js
```

---

## 2. Tables

### 2.1 `ivr_studio.ivr_flows`

One row per IVR flow (tenant-scoped by domain).

| Column | Type | Description |
|--------|------|-------------|
| `flow_id` | UUID | Primary key (default `gen_random_uuid()`). |
| `domain_uuid` | UUID | FusionPBX tenant; references `public.v_domains.domain_uuid` logically. |
| `name` | TEXT | Flow name (unique per domain). |
| `description` | TEXT | Optional description. |
| `draft_graph` | JSONB | Editor graph (nodes + edges); null until first save. |
| `draft_updated_at` | TIMESTAMPTZ | Last time draft was saved. |
| `created_by` | UUID | Optional user reference. |
| `created_at` | TIMESTAMPTZ | Row creation time. |
| `updated_at` | TIMESTAMPTZ | Last update (trigger-maintained). |
| `is_deleted` | BOOLEAN | Soft-delete flag (default false). |

**Constraints:** `UNIQUE(domain_uuid, name)`  
**Indexes:** `idx_ivr_flows_domain` (partial, where not deleted), `idx_ivr_flows_draft_graph` (GIN on `draft_graph`).

The **published** version for a flow is not stored on `ivr_flows`; it is the row in `ivr_versions` with `flow_id` and `status = 'published'`. The API derives `published_version_id` and `published_at` by joining `ivr_flows` to `ivr_versions` on that condition. The Lua engine does not read `ivr_flows`; it uses `ivr_did_routes` and `ivr_versions` only.

---

### 2.2 `ivr_studio.ivr_versions`

Immutable snapshots of a flow. Exactly **one** row per flow has `status = 'published'`; the rest are `archived`.

| Column | Type | Description |
|--------|------|-------------|
| `version_id` | UUID | Primary key. |
| `flow_id` | UUID | FK to `ivr_studio.ivr_flows(flow_id)` ON DELETE CASCADE. |
| `domain_uuid` | UUID | Tenant (denormalized for lookups). |
| `version_number` | INTEGER | Monotonic version per flow (1, 2, 3, …). |
| `status` | TEXT | `'published'` or `'archived'` (CHECK). |
| `execution_graph` | JSONB | Compiled graph used by Lua (entry_node, nodes with type/config/outputs). |
| `raw_graph` | JSONB | Original draft graph at publish time. |
| `published_by` | UUID | Optional user who published. |
| `published_at` | TIMESTAMPTZ | Publish time. |
| `checksum` | TEXT | Integrity checksum of the graph. |

**Constraints:** `UNIQUE(flow_id, version_number)`; **one published per flow** enforced by partial unique index `idx_ivr_versions_one_published` on `(flow_id) WHERE status = 'published'`.  
**Index (hot path):** `idx_ivr_versions_published_lookup` on `(domain_uuid, flow_id) WHERE status = 'published'` — used by the Lua interpreter to load the current published graph (and version_id for cache invalidation).

---

### 2.3 `ivr_studio.ivr_did_routes`

Maps an inbound destination (DID or extension) to an IVR flow. The Lua interpreter resolves the current call’s `destination_number` / `dialed_ext` against this table to get `flow_id`.

| Column | Type | Description |
|--------|------|-------------|
| `route_id` | UUID | Primary key. |
| `domain_uuid` | UUID | Tenant. |
| `destination` | TEXT | DID or extension (e.g. `2001`, `+15551234567`). |
| `flow_id` | UUID | FK to `ivr_studio.ivr_flows(flow_id)` ON DELETE CASCADE. |
| `enabled` | BOOLEAN | If false, route is ignored (default true). |
| `created_at` | TIMESTAMPTZ | Row creation time. |

**Constraints:** `UNIQUE(domain_uuid, destination)`.  
**Index (hot path):** `idx_ivr_did_routes_lookup` on `(domain_uuid, destination) WHERE enabled` — one query per inbound call.

**Note:** Some deployments may add a `route_type` column (e.g. extension vs DID); the base migration does not define it. The API may use it if present.

---

### 2.4 `ivr_studio.flow_secrets`

Stores encrypted API credentials referenced in IVR node configs as `{{secret:key_name}}`. Decryption uses a key held in a FreeSWITCH global variable (e.g. `ivr_secret_key`).

| Column | Type | Description |
|--------|------|-------------|
| `secret_id` | UUID | Primary key. |
| `domain_uuid` | UUID | Tenant. |
| `key_name` | TEXT | Logical name (e.g. `api_token`). |
| `encrypted_value` | TEXT | AES-256-GCM ciphertext. |
| `created_at` | TIMESTAMPTZ | Row creation time. |
| `updated_at` | TIMESTAMPTZ | Last update (trigger-maintained). |

**Constraints:** `UNIQUE(domain_uuid, key_name)`.

---

### 2.5 `ivr_studio.call_logs`

Per-call execution logs (written by the API server or a logging path, not by Lua during the call).

| Column | Type | Description |
|--------|------|-------------|
| `log_id` | UUID | Primary key. |
| `trace_id` | UUID | Call trace id (matches Lua logger). |
| `domain_uuid` | UUID | Tenant. |
| `flow_id` | UUID | Flow that was executed. |
| `version_id` | UUID | Published version that was run. |
| `call_uuid` | TEXT | FreeSWITCH call UUID. |
| `ani` | TEXT | Caller ID number. |
| `dnis` | TEXT | Dialed number. |
| `started_at` | TIMESTAMPTZ | Call start. |
| `ended_at` | TIMESTAMPTZ | Call end (if set). |
| `disposition` | TEXT | Outcome (e.g. hangup cause). |
| `node_trace` | JSONB | Execution path (nodes visited). |
| `api_calls` | JSONB | API-call node results. |
| `error_log` | JSONB | Errors encountered. |

**Indexes:** `idx_call_logs_domain_date`, `idx_call_logs_call_uuid`, `idx_call_logs_trace`, `idx_call_logs_flow`.

---

## 3. Triggers and functions

- **`ivr_studio.set_updated_at()`** — Sets `NEW.updated_at = NOW()`.
- **`trg_ivr_flows_updated_at`** — BEFORE UPDATE on `ivr_flows`.
- **`trg_flow_secrets_updated_at`** — BEFORE UPDATE on `flow_secrets`.

---

## 4. Permissions

The migration grants the FusionPBX database user (e.g. `fusionpbx`) full access to the schema:

- `GRANT USAGE ON SCHEMA ivr_studio TO fusionpbx;`
- `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ivr_studio TO fusionpbx;`
- `ALTER DEFAULT PRIVILEGES IN SCHEMA ivr_studio GRANT ... TO fusionpbx;`

---

## 5. FusionPBX tables used (read-only by IVR Studio)

IVR Studio does **not** create or alter these; they are used as follows:

| Table / concept | Usage |
|-----------------|--------|
| `public.v_domains` | `domain_uuid` in all ivr_studio tables aligns with FusionPBX tenants. |
| `public.v_dialplans` (or equivalent) | The API inserts/updates dialplan entries that route specific DIDs/extensions to `lua(ivr_studio/ivr_interpreter.lua)`. See SERVER_CHANGES.md and the dialplan service in the API. |

---

## 6. Summary

| Object | Action |
|--------|--------|
| Schema `ivr_studio` | CREATE IF NOT EXISTS |
| Tables: `ivr_flows`, `ivr_versions`, `ivr_did_routes`, `flow_secrets`, `call_logs` | CREATE IF NOT EXISTS + indexes + triggers |
| Function `ivr_studio.set_updated_at` | CREATE OR REPLACE |
| Grants for `fusionpbx` | GRANT on schema and tables |

All changes are contained in `db/migrations/001_ivr_studio_schema.sql`. For server-side deployment (Lua, vars, dialplan), see `SERVER_CHANGES.md`.
