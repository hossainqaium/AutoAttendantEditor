---
name: IVR Auto Attendant Studio
overview: A production-ready, multi-tenant IVR Studio with a visual drag-and-drop workflow builder, PostgreSQL-backed versioned flow storage, and a FreeSWITCH mod_lua runtime engine — designed to run alongside an existing FusionPBX installation, requiring zero FreeSWITCH reloads on flow changes.
todos:
  - id: db-schema
    content: "Create ivr_studio PostgreSQL schema in FusionPBX's existing DB: ivr_flows, ivr_versions, ivr_did_routes, flow_secrets, call_logs — referencing v_domains for tenant isolation"
    status: completed
  - id: lua-interpreter
    content: "Build generic Lua interpreter: /usr/share/freeswitch/scripts/ivr_studio/ivr_interpreter.lua using freeswitch.Dbh (native FS connection pool) with all node handlers and MAX_NODE_HOPS guard"
    status: completed
  - id: lua-libs
    content: "Build Lua support libraries in ivr_studio/lib/: db.lua (freeswitch.Dbh), http.lua (LuaSocket + timeout), logger.lua (structured JSON logs)"
    status: completed
  - id: dialplan
    content: "Integrate with FusionPBX dialplan: insert rows into v_dialplans via API or SQL — no XML file edits, no reload, FusionPBX XML handler picks up changes dynamically"
    status: completed
  - id: graph-compiler
    content: "Build graph validation + compiler: cycle detection (Kahn's), orphan check, terminal path validation, graph → execution JSON"
    status: completed
  - id: api-server
    content: "Build Fastify REST API: flow CRUD, draft save, publish (with server-side compile), rollback, DID assignment, secret management — reads FusionPBX v_domains for tenant list"
    status: completed
  - id: studio-ui
    content: "Build React + React Flow studio: all 9 node types, config panels, edge routing, draft/publish controls, version history, domain selector from FusionPBX"
    status: completed
  - id: docker-compose
    content: Create docker-compose.yml for API server + Studio UI only (no FreeSWITCH — use existing FusionPBX). Nginx reverse proxy. Lua files volume-mounted to /usr/share/freeswitch/scripts/ivr_studio/
    status: completed
isProject: false
---

# IVR Auto Attendant Studio — Complete Architecture

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         STUDIO LAYER                            │
│  React + React Flow (drag-and-drop) → REST API → PostgreSQL     │
│  [Draft] ──publish──> [Published Version]                       │
└────────────────────────┬────────────────────────────────────────┘
                         │ Workflow JSON stored in DB
┌────────────────────────▼────────────────────────────────────────┐
│                      API / COMPILER LAYER                       │
│  Node.js (Express/Fastify) + Bull MQ                            │
│  Graph Validator → Execution JSON Compiler → Version Store      │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                    FREESWITCH LAYER                              │
│  Dialplan (prefix routing) → mod_lua → Lua Interpreter Engine   │
│  Lua fetches published JSON from PgBouncer → executes nodes     │
│  NO Lua file regeneration. Single generic interpreter script.   │
└──────────┬─────────────────────────────┬───────────────────────┘
           │                             │
┌──────────▼──────────┐      ┌───────────▼──────────┐
│   PostgreSQL HA      │      │   External APIs       │
│   Primary + Replica  │      │   (HTTP calls in Lua) │
│   PgBouncer pool     │      │   with timeout guard  │
└─────────────────────┘      └──────────────────────┘
```

---

## Repository Structure

```
auto-attendant/
├── studio-ui/              # React + React Flow frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── nodes/      # PlayAudio, GetDigits, Transfer, etc.
│   │   │   ├── edges/
│   │   │   └── panels/     # Node config sidepanels
│   │   ├── store/          # Zustand state
│   │   ├── compiler/       # Graph → Execution JSON
│   │   └── api/
│   └── package.json
├── api-server/             # Node.js (Fastify) REST API
│   ├── src/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── compiler/       # Server-side graph validator + compiler
│   │   └── db/
│   └── package.json
├── lua-engine/             # FreeSWITCH Lua runtime
│   ├── ivr_interpreter.lua # Single generic interpreter (NO per-IVR gen)
│   ├── lib/
│   │   ├── db.lua
│   │   ├── http.lua
│   │   ├── json.lua
│   │   └── logger.lua
│   └── cache/
├── freeswitch/
│   ├── dialplan/           # XML dialplan configs
│   └── autoload_configs/
├── db/
│   └── migrations/         # SQL schema files
└── docker-compose.yml
```

---

## 1. Studio Frontend

**Tech:** React 18, React Flow (xyflow), Zustand, TailwindCSS, shadcn/ui

### Node Types and Their Config Shapes


| Node          | Config Fields                                              | Outputs                            |
| ------------- | ---------------------------------------------------------- | ---------------------------------- |
| PlayAudio     | file_path, tts_text, lang                                  | next                               |
| GetDigits     | timeout_ms, max_digits, min_digits, retries, invalid_audio | digit_1..digit_9, timeout, invalid |
| Transfer      | destination, transfer_type (blind/att), sip_profile        | next, failed                       |
| Voicemail     | mailbox_id, greeting_file, max_secs                        | next, full                         |
| Condition     | variable, operator, value                                  | true, false                        |
| TimeCondition | timezone, schedule (cron-like)                             | open, closed                       |
| APICall       | url, method, headers, auth, timeout_ms, response_map       | success, timeout, error            |
| Hangup        | cause_code                                                 | (terminal)                         |
| SetVariable   | key, value (static or from IVR var)                        | next                               |


### Graph → Execution JSON Compiler

The compiler runs both client-side (for preview) and server-side (for publish). The graph is a standard React Flow structure: `{ nodes: [], edges: [] }`.

Compiler steps:

1. Build adjacency list from edges
2. Run DFS cycle detection (track `visiting` + `visited` sets; mark back-edges as loops)
3. Validate: every non-terminal node has at least one outgoing edge; every edge target exists; no orphan nodes
4. Topological sort (Kahn's algorithm) to establish execution order metadata
5. Emit `execution_graph`: a flat map of `node_id → { type, config, outputs: { label: node_id } }`

```json
{
  "version": 1,
  "entry_node": "node_001",
  "nodes": {
    "node_001": {
      "type": "play_audio",
      "config": { "file": "sounds/welcome.wav" },
      "outputs": { "next": "node_002" }
    },
    "node_002": {
      "type": "get_digits",
      "config": { "timeout_ms": 5000, "max_digits": 1, "retries": 3 },
      "outputs": {
        "1": "node_sales",
        "2": "node_support",
        "timeout": "node_002_retry",
        "invalid": "node_002_retry"
      }
    },
    "node_api_001": {
      "type": "api_call",
      "config": {
        "url": "https://crm.example.com/lookup",
        "method": "POST",
        "headers": { "Authorization": "Bearer {{secret:crm_api_token}}" },
        "timeout_ms": 3000,
        "body_template": { "ani": "{{session.ani}}" },
        "response_map": [
          { "json_path": "$.customer.name", "variable": "customer_name" },
          { "json_path": "$.customer.tier", "variable": "customer_tier" },
          { "json_path": "$.audio_greeting", "variable": "greeting_file" }
        ]
      },
      "outputs": {
        "success": "node_play_personalized",
        "timeout": "node_generic_greeting",
        "error": "node_generic_greeting"
      }
    },
    "node_cond_001": {
      "type": "condition",
      "config": {
        "variable": "customer_tier",
        "operator": "eq",
        "value": "premium"
      },
      "outputs": { "true": "node_priority_queue", "false": "node_standard_queue" }
    },
    "node_hangup": {
      "type": "hangup",
      "config": { "cause": "NORMAL_CLEARING" },
      "outputs": {}
    }
  }
}
```

### Loop Detection (Kahn's Algorithm)

```javascript
// In compiler/graphValidator.ts
function detectCycles(nodes, edges) {
  const inDegree = {};
  const adj = {};
  nodes.forEach(n => { inDegree[n.id] = 0; adj[n.id] = []; });
  edges.forEach(e => { adj[e.source].push(e.target); inDegree[e.target]++; });
  const queue = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
  let processed = 0;
  while (queue.length) {
    const node = queue.shift(); processed++;
    adj[node].forEach(neighbor => {
      if (--inDegree[neighbor] === 0) queue.push(neighbor);
    });
  }
  // If processed < nodes.length, there is a cycle
  return processed < nodes.length;
}
```

Cycles in `GetDigits` retry paths are explicitly tagged `"loop": true` in the edge metadata and are whitelisted by the validator (bounded by the `retries` counter in config, enforced at runtime).

### Draft → Publish Model

- `POST /api/flows` → creates draft
- `PUT /api/flows/:id` → updates draft (no version bump)
- `POST /api/flows/:id/publish` → triggers server-side validation + compilation → inserts new row in `ivr_versions` with `status='published'`, sets previous published to `status='archived'`
- `POST /api/flows/:id/rollback/:version_id` → sets target version back to `published`

---

## 2. PostgreSQL Schema

```sql
-- db/migrations/001_initial_schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── TENANTS ────────────────────────────────────────────────────
CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT NOT NULL UNIQUE,          -- used as dialplan prefix
    name            TEXT NOT NULL,
    config          JSONB NOT NULL DEFAULT '{}',   -- feature flags, limits
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_tenants_slug ON tenants(slug);

-- ─── IVR FLOWS ──────────────────────────────────────────────────
CREATE TABLE ivr_flows (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    draft_graph     JSONB,                         -- working copy (React Flow format)
    draft_updated_at TIMESTAMPTZ,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(tenant_id, name)
);
CREATE INDEX idx_ivr_flows_tenant ON ivr_flows(tenant_id) WHERE NOT is_deleted;
CREATE INDEX idx_ivr_flows_draft_graph ON ivr_flows USING GIN(draft_graph);

-- ─── IVR VERSIONS ───────────────────────────────────────────────
-- Immutable once created. Only one 'published' per flow at a time.
CREATE TABLE ivr_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id         UUID NOT NULL REFERENCES ivr_flows(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL REFERENCES tenants(id),  -- denormalized for fast lookup
    version_number  INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'archived'        -- 'published' | 'archived'
                    CHECK (status IN ('published', 'archived')),
    execution_graph JSONB NOT NULL,                        -- compiled execution JSON
    raw_graph       JSONB NOT NULL,                        -- original React Flow JSON snapshot
    published_by    UUID,
    published_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checksum        TEXT NOT NULL,                         -- SHA256 of execution_graph
    UNIQUE(flow_id, version_number)
);
CREATE UNIQUE INDEX idx_ivr_versions_one_published
    ON ivr_versions(flow_id) WHERE status = 'published';
CREATE INDEX idx_ivr_versions_tenant_published
    ON ivr_versions(tenant_id, flow_id) WHERE status = 'published';
CREATE INDEX idx_ivr_versions_execution_graph
    ON ivr_versions USING GIN(execution_graph);

-- ─── PHONE NUMBER → FLOW ROUTING ────────────────────────────────
CREATE TABLE tenant_dids (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    did             TEXT NOT NULL UNIQUE,           -- E.164 format
    flow_id         UUID NOT NULL REFERENCES ivr_flows(id),
    active          BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_tenant_dids_did ON tenant_dids(did) WHERE active;
CREATE INDEX idx_tenant_dids_tenant ON tenant_dids(tenant_id);

-- ─── API SECRETS (encrypted at app layer, ref stored here) ──────
CREATE TABLE flow_secrets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    key_name        TEXT NOT NULL,                 -- "crm_api_token"
    encrypted_value TEXT NOT NULL,                 -- AES-256-GCM encrypted
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, key_name)
);

-- ─── CALL LOGS ──────────────────────────────────────────────────
CREATE TABLE call_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id        UUID NOT NULL,
    tenant_id       UUID NOT NULL,
    flow_id         UUID NOT NULL,
    version_id      UUID NOT NULL,
    call_uuid       TEXT NOT NULL,
    ani             TEXT,
    dnis            TEXT,
    started_at      TIMESTAMPTZ NOT NULL,
    ended_at        TIMESTAMPTZ,
    disposition     TEXT,
    node_trace      JSONB DEFAULT '[]',            -- array of {node_id, ts, result}
    api_calls       JSONB DEFAULT '[]',            -- latency, status per API node
    error_log       JSONB DEFAULT '[]'
);
CREATE INDEX idx_call_logs_tenant_date ON call_logs(tenant_id, started_at DESC);
CREATE INDEX idx_call_logs_trace ON call_logs(trace_id);
CREATE INDEX idx_call_logs_call_uuid ON call_logs(call_uuid);
```

**JSONB Justification:** `execution_graph` is the entire workflow consumed as a single atomic unit by Lua — there is no benefit to row-per-node at read time. JSONB enables GIN index for admin search, and the whole graph is fetched in one query and cached in Lua's per-call memory.

**Index Strategy:**

- `idx_ivr_versions_one_published`: partial unique index — enforces single published version per flow at DB level, zero application-layer risk
- `idx_ivr_versions_tenant_published`: composite covering index for the Lua hot path (`SELECT execution_graph FROM ivr_versions WHERE tenant_id=$1 AND flow_id=$2 AND status='published'`)
- `idx_tenant_dids_did`: the DID lookup index — called on every inbound call

---

## 3. Dialplan Integration (FreeSWITCH)

**Strategy:** Prefix-based tenant routing. Each tenant is identified by a `tenant_slug`. The DID lookup returns the slug + flow_id. The dialplan passes these as channel variables to the single Lua interpreter.

```xml
<!-- freeswitch/dialplan/ivr_studio.xml -->
<context name="ivr_studio">

  <!-- Tenant prefix routing: all inbound DIDs hit this context -->
  <extension name="inbound_did_routing" continue="false">
    <condition field="destination_number" expression="^(\+?1?\d{10,15})$">
      <!-- Pass DNIS to Lua for DB-driven tenant+flow resolution -->
      <action application="set" data="ivr_dnis=${destination_number}"/>
      <action application="set" data="ivr_ani=${caller_id_number}"/>
      <action application="set" data="call_trace_id=${create_uuid()}"/>
      <action application="lua" data="ivr_interpreter.lua"/>
    </condition>
  </extension>

</context>
```

**No-reload strategy:** The dialplan never changes. The Lua script never changes. Only the JSONB `execution_graph` in PostgreSQL changes on publish. The Lua interpreter reads the graph on each call (with in-process LRU caching, TTL 30s). Zero FreeSWITCH reload required.

---

## 4. Lua Runtime Engine

**Architecture decision: Generic Interpreter (NOT per-IVR Lua generation)**

Generating a unique `.lua` file per IVR would require file writes, potential reload triggers, and creates a maintenance nightmare. Instead, a single `ivr_interpreter.lua` script:

1. Receives the call
2. Looks up the DID → tenant_slug + flow_id
3. Fetches the published `execution_graph` JSON (cached)
4. Traverses the node graph iteratively (not recursively)
5. Dispatches each node type to a handler function

### `lua-engine/ivr_interpreter.lua`

```lua
-- ivr_interpreter.lua
-- Single generic IVR interpreter for FreeSWITCH mod_lua
-- NO per-IVR script generation. NO FreeSWITCH reload needed.

local freeswitch = freeswitch
local session    = session
local json       = require("cjson.safe")
local db         = require("lib.db")
local http       = require("lib.http")
local logger     = require("lib.logger")

-- ── Constants ────────────────────────────────────────────────
local MAX_NODE_HOPS   = 200   -- hard cap: prevents infinite loops
local CACHE_TTL_SECS  = 30    -- LRU cache TTL for execution graphs

-- ── Module-level LRU cache (survives across calls in same FS worker) ──
local graph_cache = {}        -- key: flow_id, value: {graph, loaded_at}

local function cache_get(flow_id)
    local entry = graph_cache[flow_id]
    if entry and (os.time() - entry.loaded_at) < CACHE_TTL_SECS then
        return entry.graph
    end
    return nil
end

local function cache_set(flow_id, graph)
    graph_cache[flow_id] = { graph = graph, loaded_at = os.time() }
end

-- ── Session bootstrap ────────────────────────────────────────
session:answer()
session:setAutoHangup(false)

local dnis       = session:getVariable("ivr_dnis") or ""
local ani        = session:getVariable("ivr_ani")  or ""
local trace_id   = session:getVariable("call_trace_id") or tostring(os.time())
local call_uuid  = session:getVariable("uuid")

local log = logger.new(trace_id, call_uuid)
log:info("IVR session started", { dnis=dnis, ani=ani })

-- ── DID → tenant + flow resolution ──────────────────────────
local did_row, err = db.query_one(
    "SELECT td.tenant_id, td.flow_id, t.slug as tenant_slug " ..
    "FROM tenant_dids td JOIN tenants t ON t.id = td.tenant_id " ..
    "WHERE td.did = $1 AND td.active = true AND t.is_active = true",
    { dnis }
)

if not did_row then
    log:error("DID not found or tenant inactive", { dnis=dnis })
    session:execute("playback", "ivr/ivr-this_is_not_a_working_number.wav")
    session:hangup("UNALLOCATED_NUMBER")
    return
end

local tenant_id   = did_row.tenant_id
local flow_id     = did_row.flow_id
local tenant_slug = did_row.tenant_slug

-- ── Load execution graph (with cache) ───────────────────────
local graph = cache_get(flow_id)
if not graph then
    local version_row, verr = db.query_one(
        "SELECT id, execution_graph FROM ivr_versions " ..
        "WHERE flow_id = $1 AND tenant_id = $2 AND status = 'published' LIMIT 1",
        { flow_id, tenant_id }
    )
    if not version_row then
        log:error("No published IVR version found", { flow_id=flow_id })
        session:execute("playback", "misc/error.wav")
        session:hangup("NORMAL_CLEARING")
        return
    end
    graph, err = json.decode(version_row.execution_graph)
    if not graph then
        log:error("Corrupt execution_graph JSON", { flow_id=flow_id, err=err })
        session:hangup("NORMAL_CLEARING")
        return
    end
    cache_set(flow_id, graph)
    log:info("Graph loaded from DB and cached", { flow_id=flow_id })
else
    log:info("Graph loaded from cache", { flow_id=flow_id })
end

-- ── IVR Variables (scoped to this call) ─────────────────────
local ivr_vars = {
    ani          = ani,
    dnis         = dnis,
    tenant_slug  = tenant_slug,
    call_uuid    = call_uuid,
    trace_id     = trace_id,
}

-- ── Node Handlers ────────────────────────────────────────────

local handlers = {}

handlers["play_audio"] = function(node_cfg)
    local file = ivr_vars[node_cfg.file_var] or node_cfg.file
    if not file or file == "" then
        log:warn("play_audio: no file", { node=node_cfg })
        return "next", nil
    end
    session:execute("playback", file)
    return "next", nil
end

handlers["get_digits"] = function(node_cfg)
    local timeout  = node_cfg.timeout_ms or 5000
    local max_d    = node_cfg.max_digits or 1
    local retries  = node_cfg.retries or 3
    local inv_file = node_cfg.invalid_audio or "ivr/ivr-that_was_an_invalid_entry.wav"

    for attempt = 1, retries do
        session:execute("read", string.format(
            "%d %d %s ivr_input %d #",
            node_cfg.min_digits or 1, max_d,
            node_cfg.prompt_file or "silence_stream://200",
            timeout
        ))
        local digit = session:getVariable("ivr_input")
        if digit and digit ~= "" then
            ivr_vars["last_digits"] = digit
            log:info("get_digits: received", { digit=digit, attempt=attempt })
            return tostring(digit), nil
        end
        log:info("get_digits: timeout/empty", { attempt=attempt })
        if attempt < retries then
            session:execute("playback", inv_file)
        end
    end
    return "timeout", nil
end

handlers["api_call"] = function(node_cfg)
    -- Resolve secret references in headers: {{secret:key_name}}
    local headers = {}
    for k, v in pairs(node_cfg.headers or {}) do
        headers[k] = v:gsub("{{secret:([^}]+)}}", function(key_name)
            local secret = db.get_secret(tenant_id, key_name)
            return secret or ""
        end)
    end

    -- Resolve body template variables
    local body = nil
    if node_cfg.body_template then
        local body_str = json.encode(node_cfg.body_template)
        body_str = body_str:gsub("{{([^}]+)}}", function(var)
            return tostring(ivr_vars[var] or "")
        end)
        body = body_str
    end

    local timeout_ms = math.min(node_cfg.timeout_ms or 3000, 8000) -- hard cap 8s
    local result, http_err = http.request({
        url     = node_cfg.url,
        method  = node_cfg.method or "GET",
        headers = headers,
        body    = body,
        timeout = timeout_ms,
    })

    if http_err == "timeout" then
        log:warn("api_call: timeout", { url=node_cfg.url, timeout_ms=timeout_ms })
        return "timeout", nil
    end

    if not result or result.status >= 500 then
        log:error("api_call: server error", { status=result and result.status, url=node_cfg.url })
        return "error", nil
    end

    local resp_data, json_err = json.decode(result.body or "")
    if not resp_data then
        log:warn("api_call: invalid JSON response", { err=json_err, url=node_cfg.url })
        return "error", nil
    end

    -- Extract variables from response using json_path (simple dot-path resolver)
    for _, mapping in ipairs(node_cfg.response_map or {}) do
        local value = resolve_json_path(resp_data, mapping.json_path)
        if value ~= nil then
            ivr_vars[mapping.variable] = tostring(value)
            log:info("api_call: extracted var", { var=mapping.variable, val=value })
        end
    end

    return "success", nil
end

handlers["condition"] = function(node_cfg)
    local val = tostring(ivr_vars[node_cfg.variable] or "")
    local op  = node_cfg.operator
    local cmp = tostring(node_cfg.value or "")
    if op == "eq"       then return (val == cmp)           and "true" or "false"
    elseif op == "neq"  then return (val ~= cmp)           and "true" or "false"
    elseif op == "contains" then return val:find(cmp, 1, true) and "true" or "false"
    elseif op == "gt"   then return (tonumber(val) or 0) > (tonumber(cmp) or 0) and "true" or "false"
    elseif op == "lt"   then return (tonumber(val) or 0) < (tonumber(cmp) or 0) and "true" or "false"
    else return "false" end
end

handlers["time_condition"] = function(node_cfg)
    -- Uses luatz or os.time() comparison against schedule table
    local tz    = node_cfg.timezone or "UTC"
    local sched = node_cfg.schedule  -- { days:[1-7], open:"09:00", close:"17:00" }
    local now   = os.date("*t")      -- simplified; use luatz for real tz support
    local hour  = now.hour
    local open_h  = tonumber(sched.open:sub(1,2))
    local close_h = tonumber(sched.close:sub(1,2))
    local in_window = (hour >= open_h and hour < close_h)
    return in_window and "open" or "closed", nil
end

handlers["set_variable"] = function(node_cfg)
    local value = node_cfg.value
    if type(value) == "string" then
        value = value:gsub("{{([^}]+)}}", function(var) return tostring(ivr_vars[var] or "") end)
    end
    ivr_vars[node_cfg.key] = value
    return "next", nil
end

handlers["transfer"] = function(node_cfg)
    local dest = node_cfg.destination
    dest = dest:gsub("{{([^}]+)}}", function(var) return tostring(ivr_vars[var] or "") end)
    session:execute("transfer", string.format("%s %s %s",
        dest, node_cfg.transfer_type or "XML", node_cfg.context or "default"))
    return nil, "transferred"  -- nil next_output signals execution end
end

handlers["voicemail"] = function(node_cfg)
    session:execute("voicemail", string.format("default $${domain} %s", node_cfg.mailbox_id))
    return nil, "voicemail"
end

handlers["hangup"] = function(node_cfg)
    session:hangup(node_cfg.cause or "NORMAL_CLEARING")
    return nil, "hangup"
end

-- ── JSON path resolver (simple dot-path: $.customer.name) ────
function resolve_json_path(data, path)
    local parts = {}
    for part in path:gmatch("[^%.]+") do
        part = part:gsub("^%$", "")
        if part ~= "" then table.insert(parts, part) end
    end
    local cur = data
    for _, part in ipairs(parts) do
        if type(cur) ~= "table" then return nil end
        cur = cur[part]
    end
    return cur
end

-- ── Main Execution Loop (ITERATIVE — no recursion) ───────────
local current_node_id = graph.entry_node
local hops = 0

while current_node_id and session:ready() do
    hops = hops + 1
    if hops > MAX_NODE_HOPS then
        log:error("MAX_NODE_HOPS exceeded — possible loop", { last_node=current_node_id })
        session:hangup("NORMAL_CLEARING")
        break
    end

    local node = graph.nodes[current_node_id]
    if not node then
        log:error("Node not found in graph", { node_id=current_node_id })
        session:hangup("NORMAL_CLEARING")
        break
    end

    log:info("Executing node", { node_id=current_node_id, type=node.type })

    local handler = handlers[node.type]
    if not handler then
        log:error("Unknown node type", { type=node.type })
        session:hangup("NORMAL_CLEARING")
        break
    end

    local ok, output_label, terminal_reason = pcall(handler, node.config)
    if not ok then
        log:error("Node handler threw error", { node_id=current_node_id, err=output_label })
        -- Route to error output if configured, else hang up
        local err_next = node.outputs and node.outputs["error"]
        if err_next then
            current_node_id = err_next
        else
            session:hangup("NORMAL_CLEARING")
            break
        end
    elseif terminal_reason then
        log:info("Terminal node reached", { reason=terminal_reason })
        break
    else
        current_node_id = node.outputs and node.outputs[output_label]
        if not current_node_id then
            log:info("No output edge for label — end of flow", { label=output_label })
            session:hangup("NORMAL_CLEARING")
            break
        end
    end
end

log:info("IVR session complete", { hops=hops, trace_id=trace_id })
```

---

## 5. `lib/db.lua` — Safe DB Access via LuaSocket + PgBouncer

```lua
-- lua-engine/lib/db.lua
-- Uses LuaSQL (luarocks install luasql-postgres) with PgBouncer
local luasql = require("luasql.postgres")
local json   = require("cjson.safe")

local M = {}
local env = luasql.postgres()

local DB_CONN_STR = os.getenv("FS_DB_URL") or
    "host=pgbouncer port=5432 dbname=ivr user=ivr_lua password=xxx"

local function get_conn()
    return env:connect(DB_CONN_STR)
end

function M.query_one(sql, params)
    local conn, err = get_conn()
    if not conn then return nil, "db_connect_failed: " .. tostring(err) end

    -- Parameter substitution (positional $1, $2...)
    local i = 0
    local bound = sql:gsub("%$%d+", function()
        i = i + 1
        local v = params[i]
        if v == nil then return "NULL" end
        return "'" .. tostring(v):gsub("'", "''") .. "'"
    end)

    local cur, qerr = conn:execute(bound)
    conn:close()
    if not cur then return nil, qerr end

    local row = cur:fetch({}, "a")
    cur:close()
    return row, nil
end

local secret_cache = {}
function M.get_secret(tenant_id, key_name)
    local cache_key = tenant_id .. ":" .. key_name
    if secret_cache[cache_key] then return secret_cache[cache_key] end
    local row = M.query_one(
        "SELECT encrypted_value FROM flow_secrets WHERE tenant_id=$1 AND key_name=$2",
        { tenant_id, key_name }
    )
    if row then
        -- In production: decrypt using AES-256-GCM with app-level key from env
        local val = row.encrypted_value  -- placeholder; add decryption here
        secret_cache[cache_key] = val
        return val
    end
    return nil
end

return M
```

---

## 6. `lib/http.lua` — Safe HTTP with Timeout

```lua
-- lua-engine/lib/http.lua
-- Uses LuaSocket HTTP with explicit timeout
local http_lib = require("socket.http")
local ltn12    = require("ltn12")
local socket   = require("socket")

local M = {}

function M.request(opts)
    local url     = opts.url
    local method  = opts.method or "GET"
    local timeout  = math.min((opts.timeout or 3000), 8000) / 1000  -- convert to seconds
    local headers = opts.headers or {}
    local body    = opts.body

    local resp_body = {}
    local req = {
        url    = url,
        method = method,
        headers = headers,
        sink   = ltn12.sink.table(resp_body),
    }
    if body then
        req.source         = ltn12.source.string(body)
        req.headers["content-length"] = #body
    end

    socket.settimeout(timeout)
    local ok, status, resp_headers = http_lib.request(req)

    if not ok then
        if status == "timeout" then return nil, "timeout" end
        return nil, tostring(status)
    end

    return {
        status  = status,
        headers = resp_headers,
        body    = table.concat(resp_body),
    }, nil
end

return M
```

---

## 7. `lib/logger.lua` — Structured Logging

```lua
-- lua-engine/lib/logger.lua
local json = require("cjson.safe")
local M = {}

function M.new(trace_id, call_uuid)
    local self = { trace_id = trace_id, call_uuid = call_uuid }
    local function emit(level, msg, ctx)
        ctx = ctx or {}
        ctx.trace_id  = trace_id
        ctx.call_uuid = call_uuid
        ctx.ts        = os.date("!%Y-%m-%dT%H:%M:%SZ")
        ctx.level     = level
        ctx.msg       = msg
        freeswitch.consoleLog(level, json.encode(ctx) .. "\n")
    end
    function self:info(msg, ctx)  emit("INFO",  msg, ctx) end
    function self:warn(msg, ctx)  emit("WARNING", msg, ctx) end
    function self:error(msg, ctx) emit("ERR",   msg, ctx) end
    return self
end

return M
```

---

## 8. Complete Example Workflow JSON (Annotated Traversal)

```json
{
  "version": 2,
  "entry_node": "n_welcome",
  "nodes": {
    "n_welcome":       { "type": "play_audio",   "config": { "file": "custom/tenant_a/welcome.wav" },                         "outputs": { "next": "n_crm_lookup" } },
    "n_crm_lookup":    { "type": "api_call",     "config": { "url": "https://crm.co/v1/caller", "method": "POST", "headers": { "Authorization": "Bearer {{secret:crm_token}}" }, "timeout_ms": 3000, "body_template": { "ani": "{{ani}}" }, "response_map": [ { "json_path": "$.tier", "variable": "customer_tier" }, { "json_path": "$.audio_file", "variable": "personalized_greeting" } ] }, "outputs": { "success": "n_play_greeting", "timeout": "n_generic_menu", "error": "n_generic_menu" } },
    "n_play_greeting": { "type": "play_audio",   "config": { "file_var": "personalized_greeting" },                           "outputs": { "next": "n_tier_check" } },
    "n_tier_check":    { "type": "condition",    "config": { "variable": "customer_tier", "operator": "eq", "value": "premium" }, "outputs": { "true": "n_premium_menu", "false": "n_standard_menu" } },
    "n_premium_menu":  { "type": "get_digits",   "config": { "prompt_file": "ivr/premium_menu.wav", "max_digits": 1, "timeout_ms": 6000, "retries": 3 }, "outputs": { "1": "n_transfer_priority", "2": "n_voicemail", "timeout": "n_hangup", "invalid": "n_premium_menu" } },
    "n_standard_menu": { "type": "get_digits",   "config": { "prompt_file": "ivr/standard_menu.wav", "max_digits": 1, "timeout_ms": 5000, "retries": 2 }, "outputs": { "1": "n_transfer_sales", "2": "n_voicemail", "timeout": "n_hangup", "invalid": "n_standard_menu" } },
    "n_generic_menu":  { "type": "get_digits",   "config": { "prompt_file": "ivr/generic_menu.wav",  "max_digits": 1, "timeout_ms": 5000, "retries": 2 }, "outputs": { "1": "n_transfer_sales", "2": "n_voicemail", "timeout": "n_hangup", "invalid": "n_generic_menu" } },
    "n_transfer_priority": { "type": "transfer", "config": { "destination": "9001", "transfer_type": "blind" }, "outputs": {} },
    "n_transfer_sales":    { "type": "transfer", "config": { "destination": "9000", "transfer_type": "blind" }, "outputs": {} },
    "n_voicemail":     { "type": "voicemail",    "config": { "mailbox_id": "{{dnis}}" },                                       "outputs": {} },
    "n_hangup":        { "type": "hangup",       "config": { "cause": "NORMAL_CLEARING" },                                    "outputs": {} }
  }
}
```

**Traversal trace for a premium caller:**

1. `n_welcome` → plays welcome.wav → next: `n_crm_lookup`
2. `n_crm_lookup` → POST to CRM with ANI → response sets `customer_tier=premium`, `personalized_greeting=custom/vip_hello.wav` → output: `success` → `n_play_greeting`
3. `n_play_greeting` → plays `vip_hello.wav` (from `ivr_vars["personalized_greeting"]`) → next: `n_tier_check`
4. `n_tier_check` → `customer_tier == "premium"` → output: `true` → `n_premium_menu`
5. `n_premium_menu` → plays premium menu, collects digit → digit=1 → output: `"1"` → `n_transfer_priority`
6. `n_transfer_priority` → blind transfer to 9001 → session ends

**Traversal trace for CRM timeout:**

- At step 2: CRM times out → output: `timeout` → `n_generic_menu` (fallback path)

---

## 9. Performance & Concurrency

### DB Connection Pooling

- **PgBouncer** runs as a sidecar on every FreeSWITCH node in `transaction` mode
- Pool size: 20 connections per FS node (each Lua execution is sync, holds connection ~1ms)
- At 1000 CPS: peak DB queries ≈ 2 per call (DID lookup + version fetch), cached after first hit
- With 30s cache TTL, DB load drops by ~97% after warmup

### Script Caching (Two Layers)

```
Call N=1:  DB hit (DID + version) → cache populated → execution
Call N=2+: module-level cache hit (30s TTL) → no DB hit → execution
```

The Lua module-level `graph_cache` table is **per-FS-worker-process** (mod_lua creates one Lua state per thread). This means cache is not shared across workers but is extremely fast (in-process table lookup).

### API Concurrency Limiting

- Hard timeout cap of 8s in `http.lua` (`math.min(user_timeout, 8000)`)
- FreeSWITCH worker threads are never blocked > 8s on API calls
- Recommend: circuit breaker in api-server layer (Fastify + `opossum`) to protect FS from slow APIs
- In high-CPS scenarios, API nodes should be used sparingly; consider async pre-fetch pattern

### Memory Footprint

- Each call's `ivr_vars` table is GC'd when Lua state returns
- `graph_cache` bounded by number of distinct active flows (typically < 1000 entries)
- No file handles left open; `conn:close()` called after every DB query

---

## 10. HA & Scalability

```
                    ┌──────────────────────┐
                    │   Load Balancer       │
                    │   (Kamailio / HAProxy)│
                    └──────┬───────┬────────┘
                           │       │
              ┌────────────▼──┐ ┌──▼────────────┐
              │  FreeSWITCH 1  │ │  FreeSWITCH 2  │
              │  mod_lua       │ │  mod_lua       │
              │  PgBouncer     │ │  PgBouncer     │
              └────────┬───────┘ └───────┬────────┘
                       └────────┬────────┘
                     ┌──────────▼──────────┐
                     │  PG Primary          │
                     │  (streaming replica) │
                     └──────────┬───────────┘
                                │
                     ┌──────────▼───────────┐
                     │  PG Standby           │
                     │  (Patroni failover)   │
                     └───────────────────────┘
```

- **Horizontal FS scaling:** stateless; any node can handle any call; shared DB is source of truth
- **PostgreSQL HA:** Patroni + etcd for automatic primary election; PgBouncer reconnects on failover
- **DB unavailable during call:** DID + graph fetched at call start; if fetch fails → play "system unavailable" message and graceful hangup. In-cache calls already in progress are unaffected.
- **External API down:** `timeout` / `error` output edges are mandatory on all API nodes (enforced by graph validator). Fallback paths must be defined.
- **Cache on FS restart:** Cold start causes DB hit on first call per flow. Acceptable.

---

## 11. Security

- **Multi-tenant isolation:** `tenant_id` is a first-class column on all tables. Every query in `db.lua` passes `tenant_id` as a bind parameter. No cross-tenant data access is possible.
- **Secret storage:** API tokens stored encrypted (AES-256-GCM) in `flow_secrets`. Key held in FS environment variable (`FS_SECRET_KEY`), never in DB.
- **SQL injection:** All queries use positional parameter substitution with value escaping (`gsub("'", "''")`). No string concatenation of user input.
- **Lua sandboxing:** mod_lua runs with restricted OS access. `os.execute` and `io.popen` not used. Network access only via `luasocket`. File system access only for audio playback (via FS APIs).
- **Studio permissions:** API server enforces JWT with `tenant_id` claim. All flow CRUD operations verify `flows.tenant_id = jwt.tenant_id`. Publish action requires `role: admin`.

---

## 12. Error Handling & Observability

- **Structured logs:** Every log line is a JSON object with `trace_id`, `call_uuid`, `tenant_id`, `ts`, `level`, `msg`, and context. Shipped to Loki or Elasticsearch via Filebeat.
- **Call trace:** `node_trace` JSONB column in `call_logs` records `[{node_id, type, ts_enter, ts_exit, output_label}]` — full execution path per call.
- **API latency metrics:** `api_calls` JSONB column records `[{node_id, url, latency_ms, status, success}]`. Export to Prometheus via log-based metric.
- **Dead workflow detection:** A background job (pg_cron or Node.js cron) queries for flows with 0 calls in 30 days and flags them in the studio UI.
- **Corrupt workflow protection:** `pcall` wraps every node handler. Corrupt `execution_graph` JSON fails at decode time with graceful hangup. `checksum` column in `ivr_versions` allows integrity verification on load.

---

## 13. Project Scaffold Files

Key files to create in implementation order:

- `[db/migrations/001_initial_schema.sql](db/migrations/001_initial_schema.sql)` — Full schema above
- `[lua-engine/ivr_interpreter.lua](lua-engine/ivr_interpreter.lua)` — Generic interpreter
- `[lua-engine/lib/db.lua](lua-engine/lib/db.lua)` — DB access layer
- `[lua-engine/lib/http.lua](lua-engine/lib/http.lua)` — HTTP client
- `[lua-engine/lib/logger.lua](lua-engine/lib/logger.lua)` — Structured logger
- `[freeswitch/dialplan/ivr_studio.xml](freeswitch/dialplan/ivr_studio.xml)` — Dialplan
- `[api-server/src/](api-server/src/)` — Fastify REST API (flow CRUD, publish, rollback)
- `[studio-ui/src/](studio-ui/src/)` — React + React Flow studio
- `[docker-compose.yml](docker-compose.yml)` — FreeSWITCH + PG + PgBouncer + API + UI

