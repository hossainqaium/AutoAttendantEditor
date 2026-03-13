# IVR Studio

Production-ready drag-and-drop IVR / Auto Attendant Studio built for **FusionPBX / FreeSWITCH**.

## Architecture

```
Studio UI (React + ReactFlow)
    │
    ▼
API Server (Fastify/Node.js)  ──── FusionPBX PostgreSQL
    │                                  ivr_studio.* schema
    │                                  public.v_dialplans (dialplan entries)
    │                                  public.v_domains   (tenant list)
    ▼
FreeSWITCH (existing FusionPBX)
    └── mod_lua → ivr_studio/ivr_interpreter.lua
                  reads execution_graph from DB on each call
                  version-aware cache (5s TTL + immediate invalidation on publish)
```

## Quick Start

### 1. Prerequisites
- FusionPBX running with PostgreSQL accessible
- Node.js 18+

### 2. Environment Setup
```bash
cd api-server
cp .env.example .env   # or copy from api-server/.env
# Edit .env with your FusionPBX DB credentials and IVR_SECRET_KEY
```

### 3. Database Migration
```bash
cd api-server
npm install
npm run migrate        # runs db/migrations/001_ivr_studio_schema.sql
```

If upgrading from an earlier install, also apply incremental migrations:
```bash
# Migration 002 — adds route_type column to ivr_did_routes (idempotent, safe to re-run)
psql -h 127.0.0.1 -U fusionpbx -d fusionpbx -f db/migrations/002_add_route_type.sql
```

### 4. Deploy Lua Engine to FreeSWITCH
Use the provided deployment script (handles SSH, sudo copy, and file permissions):
```bash
chmod +x deploy.sh
./deploy.sh qaium@your-fusionpbx-host
```

Or manually:
```bash
scp lua-engine/ivr_interpreter.lua qaium@your-fusionpbx:/tmp/
ssh qaium@your-fusionpbx "sudo cp /tmp/ivr_interpreter.lua /usr/share/freeswitch/scripts/ivr_studio/"
```

Add to FusionPBX `vars.xml` (or set in FreeSWITCH global vars):
```xml
<!-- DB connection for Lua engine -->
<X-PRE-PROCESS cmd="set" data="ivr_studio_db_dsn=pgsql://hostaddr=127.0.0.1 dbname=fusionpbx user=fusionpbx password=YOUR_PASSWORD"/>

<!-- Required: encryption key for API secrets (must match IVR_SECRET_KEY in api-server/.env) -->
<X-PRE-PROCESS cmd="set" data="ivr_secret_key=YOUR_64_CHAR_HEX_KEY"/>
```

### 5. Start API Server and Studio UI
```bash
# API server (default port 3002)
cd api-server && npm start

# Studio UI dev server (proxies /api → localhost:3002)
cd studio-ui && npm run dev
```

- Studio UI: `http://localhost:5173`
- API Server: `http://localhost:3002`

> **Running everything on the same FusionPBX server?**
> See [`INSTALL_ALL_IN_SINGLE_SERVER.md`](./INSTALL_ALL_IN_SINGLE_SERVER.md) for nginx setup,
> CORS config, and notes on the FusionPBX `/api` conflict.

## Usage

1. Open Studio UI → select your FusionPBX domain
2. Create a new IVR flow
3. Drag nodes from the left palette onto the canvas
4. Connect nodes with edges
5. Configure each node in the right panel
6. Click **Publish** → the graph is compiled and stored in PostgreSQL
7. Go to **Extensions/DIDs** tab → assign a phone number or extension to the flow
   - Writes a `v_dialplans` entry in FusionPBX's DB and runs `xml_reload` in FreeSWITCH
8. Call the DID or extension — FreeSWITCH routes to `ivr_studio/ivr_interpreter.lua`

## Node Types

| Node | Purpose |
|------|---------|
| Play Audio | Play a static or dynamically-selected audio file |
| Get Digits | Collect DTMF input with configurable retries, welcome/prompt/no-input/timed-out audio |
| Transfer | Blind or attended transfer to extension/external number |
| Voicemail | Send caller to FusionPBX voicemail |
| Condition | Branch based on IVR variable value |
| Time Condition | Branch based on business hours schedule |
| API Call | HTTP GET/POST to external API; extract JSON response vars |
| Set Variable | Set an IVR variable (static or templated) |
| Hangup | End the call with a cause code |

## Get Digits — Audio Play Order

The `get_digits` node plays audio in this order:

| Step | Audio field | When |
|------|-------------|------|
| 1 | `welcome_audio` | Once at the very start, before any prompt |
| 2 | `prompt_file` | Each attempt — played by FreeSWITCH `read` while waiting for DTMF |
| 3 | `no_input_audio` | After every failed attempt (no input or invalid digit), including the last |
| 4 | `timed_out_audio` | Once after all retries exhausted, then routes to the `timeout` output |

## FusionPBX Integration Notes

- **Tenants = FusionPBX Domains**: `domain_uuid` from `v_domains` is the tenant identifier
- **DB access**: Lua uses `freeswitch.Dbh` (native FS connection pool) — no extra drivers needed
- **Schema isolation**: all IVR Studio tables live in the `ivr_studio` schema; FusionPBX upgrades won't affect them
- **Execution graph cache**: Lua caches the published graph per worker (5s TTL). After publishing, the next call immediately picks up the new version via a lightweight `version_id` check — no stale-cache issues
- **Dialplan entries**: written directly to `public.v_dialplans`; FreeSWITCH XML cache is flushed via `xml_reload` after each assignment
- **Server setup details**: see [`SERVER_CHANGES.md`](./SERVER_CHANGES.md) and [`DB_CHANGE.md`](./DB_CHANGE.md)

## Security

- API secrets encrypted with AES-256-GCM before storage
- All DB queries are scoped to `domain_uuid` — cross-tenant access is impossible
- Lua `MAX_NODE_HOPS=200` prevents infinite loops
- `pcall` wraps every node handler — a single bad node cannot crash the call

## Directory Structure

```
auto-attendant/
├── db/
│   └── migrations/
│       ├── 001_ivr_studio_schema.sql   Initial schema (run on first install)
│       └── 002_add_route_type.sql      Add route_type to ivr_did_routes (upgrade)
├── lua-engine/                         Deploy to /usr/share/freeswitch/scripts/ivr_studio/
│   ├── ivr_interpreter.lua
│   └── lib/
│       ├── db.lua                      freeswitch.Dbh wrapper
│       ├── http.lua                    LuaSocket HTTP client
│       └── logger.lua                  Structured JSON logging
├── api-server/                         Fastify REST API (port 3002)
│   ├── src/
│   │   ├── index.js
│   │   ├── routes/
│   │   └── services/dialplanService.js
│   ├── scripts/migrate.js
│   └── .env                            DB credentials, ports, secret key
├── studio-ui/                          React + ReactFlow UI (port 5173 in dev)
├── deploy.sh                           One-shot Lua + DB deploy over SSH
├── SERVER_CHANGES.md                   All changes made to the FusionPBX server
├── DB_CHANGE.md                        Full database schema reference
└── INSTALL_ALL_IN_SINGLE_SERVER.md     Guide for running on the FusionPBX server itself
```
