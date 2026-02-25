# IVR Studio — Architecture Reference

> **Purpose:** Authoritative technical reference for the IVR Studio codebase. Used by AI agents and developers to understand system structure, data flow, and conventions before making changes.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Repository Layout](#2-repository-layout)
3. [API Server](#3-api-server)
4. [Studio UI](#4-studio-ui)
5. [Lua Engine](#5-lua-engine)
6. [Database Schema](#6-database-schema)
7. [Frontend ↔ Backend Connection](#7-frontend--backend-connection)
8. [Audio File Handling](#8-audio-file-handling)
9. [Environment Variables](#9-environment-variables)
10. [Deployment](#10-deployment)
11. [Key Conventions](#11-key-conventions)

---

## 1. System Overview

IVR Studio is a visual drag-and-drop IVR builder that integrates with FusionPBX / FreeSWITCH. It allows users to design call flows graphically and publish them as live dialplan entries — **without requiring a FreeSWITCH reload**.

```
Browser (React + ReactFlow)
        │  HTTP /api/*
        ▼
API Server (Fastify / Node.js)   ←──── .env credentials
        │                  │
        │ PostgreSQL        │ SSH / SFTP
        ▼                  ▼
FusionPBX DB          FusionPBX Server (192.168.0.113)
(v_domains,            /usr/share/freeswitch/sounds/…
 v_dialplans,          /var/lib/freeswitch/recordings/…
 v_recordings, …)
        ▲
        │ freeswitch.Dbh
Lua Engine (ivr_interpreter.lua)
running inside FreeSWITCH
```

**Multi-tenancy:** Every resource is scoped by `domain_uuid` (FusionPBX domain = tenant).

---

## 2. Repository Layout

```
Auto Attendant/
├── api-server/               # Fastify REST API (Node.js)
│   ├── src/
│   │   ├── index.js          # Server bootstrap, CORS, multipart, route registration
│   │   ├── db/index.js       # PostgreSQL connection pool (pg)
│   │   ├── routes/
│   │   │   ├── assets.js     # Audio upload, recordings, destinations, sound streaming
│   │   │   ├── callLogs.js   # Call execution log queries
│   │   │   ├── dids.js       # DID/extension → flow routing + v_dialplans writes
│   │   │   ├── domains.js    # Lists FusionPBX domains (v_domains)
│   │   │   ├── flows.js      # Flow CRUD, draft save, publish, rollback, validate
│   │   │   ├── secrets.js    # AES-256-GCM encrypted API secrets
│   │   │   └── versions.js   # Published version history
│   │   ├── services/
│   │   │   └── dialplanService.js  # Writes entries to public.v_dialplans
│   │   └── compiler/
│   │       └── graphCompiler.js    # Graph validation + compile to execution JSON
│   ├── .env                  # Local config (gitignored in prod)
│   ├── package.json
│   └── Dockerfile
│
├── studio-ui/                # React + ReactFlow frontend (TypeScript + Vite)
│   ├── src/
│   │   ├── main.tsx          # App bootstrap
│   │   ├── App.tsx           # Domain selector, tab navigation
│   │   ├── api/client.ts     # Typed fetch wrapper for all API calls
│   │   ├── store/flowStore.ts # Zustand global state (nodes, edges, flows, undo/redo)
│   │   ├── compiler/graphCompiler.ts  # Client-side validation (mirrors server)
│   │   ├── lib/utils.ts      # cn() helper, misc utils
│   │   ├── data/templates.ts # Built-in IVR flow templates
│   │   └── components/
│   │       ├── FlowEditor.tsx         # ReactFlow canvas, palette, toolbar
│   │       ├── AudioManagerModal.tsx  # Audio browse / upload / record modal
│   │       ├── TemplatesModal.tsx     # Template picker
│   │       ├── nodes/
│   │       │   ├── index.tsx          # Node type registry
│   │       │   ├── NodeBase.tsx       # Shared node shell + handle rendering
│   │       │   └── [NodeType].tsx     # Per-type node components
│   │       ├── panels/
│   │       │   └── NodeConfigPanel.tsx  # Right-panel config forms (per node type)
│   │       └── edges/
│   │           └── AddableEdge.tsx    # Custom edge with add-node affordance
│   ├── vite.config.ts        # Dev proxy: /api → localhost:3002
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── Dockerfile            # Multi-stage: Vite build → Nginx serve
│
├── lua-engine/               # FreeSWITCH Lua interpreter
│   ├── ivr_interpreter.lua   # Main entry point (called by FreeSWITCH dialplan)
│   └── lib/
│       ├── db.lua            # Database wrapper (freeswitch.Dbh)
│       ├── http.lua          # HTTP client (LuaSocket + LuaSec)
│       └── logger.lua        # Structured logging
│
├── db/
│   └── migrations/
│       └── 001_ivr_studio_schema.sql  # Full schema (ivr_studio schema + indexes)
│
├── docker-compose.yml        # api + ui containers
├── deploy.sh                 # Remote deploy from workstation (SSH)
├── deploy-on-server.sh       # Deploy run directly on FusionPBX server
├── server-setup.sh           # Full first-time server setup
└── docs/
    └── architecture.md       # This file
```

---

## 3. API Server

**Runtime:** Node.js 20, Fastify 4  
**Port:** `3002` (dev) / `3001` (Docker default, overridden by `PORT` env)  
**All routes prefixed:** `/api`

### Route Summary

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/domains` | List FusionPBX domains |
| GET | `/api/flows` | List flows for a domain |
| POST | `/api/flows` | Create a new flow |
| GET | `/api/flows/:id` | Get flow (draft + latest published) |
| PUT | `/api/flows/:id/draft` | Save draft graph |
| POST | `/api/flows/:id/publish` | Compile + publish (creates version, writes dialplan) |
| POST | `/api/flows/:id/rollback/:versionId` | Restore a previous version |
| DELETE | `/api/flows/:id` | Soft-delete a flow |
| GET | `/api/flows/:id/validate` | Validate draft graph |
| GET | `/api/versions` | Version history for a flow |
| GET | `/api/dids` | List DID routes for a domain |
| POST | `/api/dids` | Assign DID → flow |
| PUT | `/api/dids/:id` | Update DID route |
| DELETE | `/api/dids/:id` | Remove DID route |
| GET | `/api/secrets` | List secret keys for a domain |
| POST | `/api/secrets` | Create/update encrypted secret |
| DELETE | `/api/secrets/:id` | Delete secret |
| GET | `/api/call-logs` | Query call logs |
| GET | `/api/assets/recordings` | List custom recordings (`v_recordings`) |
| POST | `/api/assets/recordings/upload` | Upload audio file (local → SFTP fallback) |
| GET | `/api/assets/sounds` | Full sound catalog (custom + built-in) |
| GET | `/api/assets/sounds/stream` | **Stream audio file from FusionPBX server** |
| GET | `/api/assets/destinations` | Extensions, ring groups, queues, voicemails |
| GET | `/api/templates` | Built-in IVR flow templates |
| GET | `/health` | Health check |

### Graph Compile Pipeline

```
Draft (ReactFlow JSON)
  │
  ▼  graphCompiler.js
Validation (cycles, orphan nodes, required handles, unreachable nodes)
  │
  ▼
Execution JSON (node map, entry node id, edge map)
  │
  ▼  dialplanService.js
v_dialplans entry (DID → "lua ivr_studio/ivr_interpreter.lua")
  │
  ▼
ivr_versions row (execution_graph, raw_graph, checksum, status='published')
```

### SFTP Integration

All file I/O against the FusionPBX server uses `ssh2-sftp-client`:
- **Credentials:** `FUSIONPBX_SSH` (`user@host`) + `FUSIONPBX_SSH_PASSWORD`
- **Upload path:** `{FS_RECORDINGS_PATH}/{domain_name}/{filename}`
- **Strategy for uploads:** try local write → try direct SFTP → try SSH `sudo mv`
- **Strategy for streaming:** try local read → try SFTP with multiple candidate paths (see §8)

---

## 4. Studio UI

**Framework:** React 18 + TypeScript  
**Build tool:** Vite 5  
**Styling:** Tailwind CSS 3 + Radix UI primitives  
**Flow canvas:** ReactFlow 11 (`reactflow` package)  
**State:** Zustand 5

### State Management (`store/flowStore.ts`)

The Zustand store holds:
- `domains` — list of FusionPBX domains
- `selectedDomain` — active domain UUID + name
- `flows` — list of flows for the selected domain
- `selectedFlow` — currently open flow (with draft graph)
- `nodes` / `edges` — ReactFlow graph state
- `undoStack` / `redoStack` — history snapshots
- Actions: `loadFlow`, `saveDraft`, `publishFlow`, `undo`, `redo`, etc.

### Node Types

| Type | Description |
|------|-------------|
| `play_audio` | Play a WAV file (built-in path or custom recording filename) |
| `get_digits` | Collect DTMF input; branching handles per digit + `timeout` |
| `transfer` | Blind/attended transfer to extension or external number |
| `voicemail` | Route to FusionPBX voicemail box |
| `condition` | Variable comparison (eq/ne/gt/lt/contains/not_empty); `true`/`false` handles |
| `time_condition` | Business hours check; `open`/`closed` handles |
| `api_call` | HTTP GET/POST; `success`/`error`/`timeout` handles; JSON path → variable mapping |
| `set_variable` | Set a named IVR channel variable |
| `hangup` | End call with a cause code |

### Audio Manager Modal (`components/AudioManagerModal.tsx`)

Three tabs:
- **Browse All** — searchable list of all audio files (custom recordings + built-in FreeSWITCH sounds), grouped by category, with collapsible sections. Each file has a **Play** button (streams from `/api/assets/sounds/stream`) and a **Copy path** button.
- **Upload .wav** — drag-and-drop or click to upload an audio file to the FusionPBX server.
- **Record Audio** — browser microphone recording, encoded to WAV, then uploaded.

**Important scroll fix:** `BrowseTab` root must have `flex-1 min-h-0` (not `h-full`) so the inner `overflow-y-auto` list can scroll within the constrained modal height.

---

## 5. Lua Engine

**Location on server:** `/usr/share/freeswitch/scripts/ivr_studio/`

**Entry point:** `ivr_interpreter.lua`  
Invoked by FreeSWITCH dialplan action:
```xml
<action application="lua" data="ivr_studio/ivr_interpreter.lua"/>
```

**Execution flow:**
1. Receives call via FreeSWITCH channel
2. Queries `ivr_studio.ivr_versions` for the published execution graph (by DID/domain)
3. Walks the node graph, executing each node type
4. Makes HTTP calls for `api_call` nodes (via LuaSocket)
5. Logs execution trace to `ivr_studio.call_logs` asynchronously
6. No FreeSWITCH reload required — reads live from DB on each call

**Dependencies:**
- `lua-cjson` — JSON parsing
- `lua-socket` — HTTP client
- `lua-sec` — HTTPS/TLS support
- `cjson.safe` shim (installed by `server-setup.sh`)

---

## 6. Database Schema

**Schema:** `ivr_studio` (isolated from FusionPBX `public` schema)  
**Migration:** `db/migrations/001_ivr_studio_schema.sql`

### Tables

#### `ivr_studio.ivr_flows`
| Column | Type | Notes |
|--------|------|-------|
| `flow_id` | UUID PK | |
| `domain_uuid` | UUID | FK → `public.v_domains` |
| `name` | text | |
| `description` | text | |
| `draft_graph` | JSONB | ReactFlow `{nodes, edges}` |
| `draft_updated_at` | timestamptz | |
| `created_at` | timestamptz | |
| `is_deleted` | boolean | Soft delete |

#### `ivr_studio.ivr_versions`
| Column | Type | Notes |
|--------|------|-------|
| `version_id` | UUID PK | |
| `flow_id` | UUID | FK → `ivr_flows` |
| `version_number` | integer | Auto-increment per flow |
| `status` | text | `'published'` or `'archived'` |
| `execution_graph` | JSONB | Compiled format (used by Lua) |
| `raw_graph` | JSONB | Original ReactFlow graph |
| `checksum` | text | SHA-256 of execution_graph |
| `created_at` | timestamptz | |
| `published_by` | text | |
| **Unique:** | | One `published` row per `flow_id` |

#### `ivr_studio.ivr_did_routes`
| Column | Type | Notes |
|--------|------|-------|
| `route_id` | UUID PK | |
| `domain_uuid` | UUID | |
| `destination` | text | DID or extension number |
| `flow_id` | UUID | FK → `ivr_flows` |
| `route_type` | text | `'both'`, `'public'`, `'internal'` |
| `enabled` | boolean | |

#### `ivr_studio.flow_secrets`
| Column | Type | Notes |
|--------|------|-------|
| `secret_id` | UUID PK | |
| `domain_uuid` | UUID | |
| `key_name` | text | |
| `encrypted_value` | text | AES-256-GCM, base64 encoded |

#### `ivr_studio.call_logs`
| Column | Type | Notes |
|--------|------|-------|
| `log_id` | UUID PK | |
| `trace_id` | UUID | Groups related log entries |
| `domain_uuid` | UUID | |
| `flow_id` | UUID | |
| `version_id` | UUID | |
| `call_uuid` | text | FreeSWITCH call UUID |
| `ani` | text | Caller ID |
| `dnis` | text | Dialed number |
| `started_at` | timestamptz | |
| `ended_at` | timestamptz | |
| `disposition` | text | `'completed'`, `'failed'`, etc. |
| `node_trace` | JSONB | Array of node execution steps |
| `api_calls` | JSONB | Array of API call results |
| `error_log` | JSONB | Error details |

### FusionPBX Tables Used (read)
- `public.v_domains` — tenant list
- `public.v_recordings` — custom audio recording metadata
- `public.v_extensions` — SIP extensions
- `public.v_ring_groups` — ring group destinations
- `public.v_call_center_queues` — call center queue destinations
- `public.v_voicemails` — voicemail boxes

### FusionPBX Tables Written
- `public.v_dialplans` — dialplan entries (DID routing to Lua script)

---

## 7. Frontend ↔ Backend Connection

### Development
```
Browser → localhost:5173 (Vite dev server)
                │
                │ /api/* proxied to localhost:3002
                ▼
          API Server (Fastify)
```
Proxy config in `studio-ui/vite.config.ts`:
```ts
proxy: { '/api': 'http://localhost:3002' }
```

### Production (Docker)
```
Browser → Nginx :80
               │
               │ /api/* → api container :3001 (internal network)
               │ /*     → static Vite build
```

### API Client (`api/client.ts`)
All API calls go through a typed client. Base path: `/api`. Always pass `domainUuid` as a query param for domain-scoped resources.

---

## 8. Audio File Handling

### File Locations on FusionPBX Server

| Type | Path |
|------|------|
| Custom recordings | `{FS_RECORDINGS_PATH}/{domain_name}/{filename}` |
| Built-in sounds (direct) | `{FS_SOUNDS_BASE}/{category}/{filename}` |
| Built-in sounds (with rate subdir) | `{FS_SOUNDS_BASE}/{category}/{rate}/{filename}` |

**Default values:**
- `FS_RECORDINGS_PATH` = `/var/lib/freeswitch/recordings`
- `FS_SOUNDS_BASE` = `/usr/share/freeswitch/sounds/en/us/callie`

### Sound Path Format

Paths stored in the app (e.g. `ivr/ivr-welcome.wav`) omit the sample-rate subdirectory. On disk, FreeSWITCH stores them at:
```
ivr/8000/ivr-welcome.wav
ivr/16000/ivr-welcome.wav
```

### Stream Endpoint: `GET /api/assets/sounds/stream`

**Query params:**
- `path` (required) — relative path, e.g. `ivr/ivr-welcome.wav` or `my_recording.wav`
- `domainUuid` (optional) — required to resolve custom recordings to domain folder

**Candidate resolution order:**
1. `{FS_SOUNDS_BASE}/{path}` (direct)
2. `{FS_SOUNDS_BASE}/{dir}/8000/{filename}`
3. `{FS_SOUNDS_BASE}/{dir}/16000/{filename}`
4. `{FS_SOUNDS_BASE}/{dir}/32000/{filename}`
5. `{FS_SOUNDS_BASE}/{dir}/48000/{filename}`
6. `{FS_RECORDINGS_PATH}/{domain_name}/{filename}` (if `domainUuid` provided)

Tries each path locally first, then via SFTP on the FusionPBX server.

---

## 9. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `127.0.0.1` | FusionPBX PostgreSQL host |
| `DB_PORT` | `5433` | PostgreSQL port |
| `DB_NAME` | `fusionpbx` | Database name |
| `DB_USER` | `fusionpbx` | DB username |
| `DB_PASSWORD` | — | DB password (required) |
| `IVR_SECRET_KEY` | — | 64-char hex key for AES-256-GCM (required) |
| `PORT` | `3001` | API server port |
| `HOST` | `0.0.0.0` | API bind address |
| `LOG_LEVEL` | `info` | Pino log level |
| `NODE_ENV` | `production` | Environment |
| `STUDIO_ORIGIN` | `http://localhost:5173` | CORS allowed origin |
| `FUSIONPBX_SSH` | — | SSH target, e.g. `qaium@192.168.0.113` |
| `FUSIONPBX_SSH_PASSWORD` | — | SSH password |
| `FUSIONPBX_SSH_PORT` | `22` | SSH port |
| `FS_RECORDINGS_PATH` | `/var/lib/freeswitch/storage/recordings` | Custom recordings base dir |
| `FS_SOUNDS_BASE` | `/usr/share/freeswitch/sounds/en/us/callie` | Built-in sounds base dir |

**Current dev values (from `api-server/.env`):**
- FusionPBX server: `192.168.0.113` (SSH user: `qaium`)
- DB port: `5433` (tunnelled)
- API port: `3002`

---

## 10. Deployment

### Development (local)

```bash
# Terminal 1 — API server
cd api-server && node src/index.js          # port 3002

# Terminal 2 — UI dev server
cd studio-ui && npm run dev                 # port 5173
```

> **Note:** `node --watch` hits macOS file-descriptor limits (`EMFILE`). Use plain `node` instead.

### Docker (production)

```bash
docker-compose up -d
```

Services:
- `api` — Node 20 Alpine, port 3001, connects to FusionPBX PostgreSQL
- `ui` — Nginx serving Vite build, port 80

### First-time Server Setup

```bash
# On the FusionPBX server (192.168.0.113)
bash server-setup.sh
```

Installs Lua dependencies, deploys Lua engine to `/usr/share/freeswitch/scripts/ivr_studio/`, runs DB migration, configures `vars.xml`.

### Remote Deploy (from workstation)

```bash
bash deploy.sh
```

Uploads SQL migration and Lua files via SSH/SCP.

---

## 11. Key Conventions

### Coding Style
- **TypeScript** (UI) — strict mode, no `any`, prefer named exports
- **JavaScript** (API) — CommonJS (`require`), `'use strict'`, async/await
- **Tailwind** — utility-first; use `cn()` from `lib/utils.ts` for conditional classes
- No `h-full` on flex children — use `flex-1 min-h-0` to enable inner scroll containers

### Audio Paths
- Always store relative paths (e.g. `ivr/ivr-welcome.wav`) — never absolute
- Built-in sounds use the path without sample-rate subdir; the server and Lua resolve the rate
- Custom recordings use just the filename; domain context provides the folder

### Multi-tenancy
- Every DB query filters by `domain_uuid`
- Every API endpoint requires `domainUuid` query param for domain-scoped resources
- The Lua engine scopes all lookups by domain at call time

### Draft / Publish Lifecycle
```
Create flow → Edit (saves to draft_graph) → Validate → Publish
                                                           │
                                              Creates ivr_versions row (published)
                                              Archives previous published version
                                              Writes/updates v_dialplans entry
                                              Previous version → archived
```

### Secrets
- Stored encrypted in `flow_secrets` (AES-256-GCM)
- Key: `IVR_SECRET_KEY` env var (64 hex chars = 32 bytes)
- Decrypted only at call time by the Lua engine (reads via API call node secret reference)

### SFTP vs Local
- The API server tries **local file system first** for all file operations
- Falls back to **SFTP** automatically when local paths don't exist
- This means the same code works whether the API is co-located with FusionPBX (local) or remote (SFTP)
