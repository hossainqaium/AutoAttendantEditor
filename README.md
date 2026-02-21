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
                  reads execution_graph from DB
                  NO reload needed on flow changes
```

## Quick Start

### 1. Prerequisites
- FusionPBX running with PostgreSQL accessible
- Node.js 18+ and Docker (optional)

### 2. Database Migration
```bash
cd api-server
cp ../.env.example .env
# Edit .env with your FusionPBX DB credentials
npm install
npm run migrate
```

### 3. Deploy Lua Engine to FreeSWITCH
```bash
# Copy to your FusionPBX host
scp -r lua-engine/ root@your-fusionpbx:/usr/share/freeswitch/scripts/ivr_studio/
```

Add to FusionPBX `vars.xml` (or set in FreeSWITCH global vars):
```xml
<!-- Optional: override DB connection for Lua -->
<X-PRE-PROCESS cmd="set" data="ivr_studio_db_dsn=pgsql://hostaddr=127.0.0.1 dbname=fusionpbx user=fusionpbx password=YOUR_PASSWORD"/>

<!-- Required: encryption key for API secrets (must match IVR_SECRET_KEY in .env) -->
<X-PRE-PROCESS cmd="set" data="ivr_secret_key=your_64_char_hex_key"/>
```

### 4. Start API Server and Studio UI
```bash
# With Docker Compose
cp .env.example .env
# Edit .env
docker-compose up -d

# Or run locally
cd api-server && npm start &
cd studio-ui && npm run dev
```

Studio UI: http://localhost:5173
API Server: http://localhost:3001

## Usage

1. Open Studio UI → select your FusionPBX domain
2. Create a new IVR flow
3. Drag nodes from the left palette onto the canvas
4. Connect nodes with edges
5. Configure each node in the right panel
6. Click **Publish** → the graph is compiled and stored in PostgreSQL
7. Go to **DIDs** tab → assign a phone number to the flow
   - This writes a `v_dialplans` entry in FusionPBX's DB **immediately** — no reload needed
8. Call the DID — FreeSWITCH routes to `ivr_studio/ivr_interpreter.lua`

## Node Types

| Node | Purpose |
|------|---------|
| Play Audio | Play a static or dynamically-selected audio file |
| Get Digits | Collect DTMF input with configurable retries |
| Transfer | Blind or attended transfer to extension/external |
| Voicemail | Send caller to FusionPBX voicemail |
| Condition | Branch based on IVR variable value |
| Time Condition | Branch based on business hours schedule |
| API Call | HTTP GET/POST to external API; extract JSON response vars |
| Set Variable | Set an IVR variable (static or templated) |
| Hangup | End the call with a cause code |

## FusionPBX Integration Notes

- **No FreeSWITCH reload needed**: dialplan entries go directly into `v_dialplans` which FusionPBX's XML handler reads dynamically
- **Tenants = FusionPBX Domains**: the `domain_uuid` from `v_domains` is used as the tenant identifier
- **DB access**: Lua uses `freeswitch.Dbh` (native FS connection pool) — no additional drivers needed
- **Schema isolation**: all IVR Studio tables live in the `ivr_studio` schema; FusionPBX upgrades won't affect them

## Security

- API secrets encrypted with AES-256-GCM before storage
- All DB queries are scoped to `domain_uuid` — cross-tenant access is impossible
- Lua `MAX_NODE_HOPS=200` prevents infinite loops
- `pcall` wraps every node handler — a single bad node cannot crash the call

## Directory Structure

```
auto-attendant/
├── db/migrations/          SQL schema (run once against FusionPBX PG)
├── lua-engine/             Deploy to /usr/share/freeswitch/scripts/ivr_studio/
│   ├── ivr_interpreter.lua
│   └── lib/
│       ├── db.lua          freeswitch.Dbh wrapper
│       ├── http.lua        LuaSocket HTTP client
│       └── logger.lua      Structured JSON logging
├── api-server/             Fastify REST API
├── studio-ui/              React + ReactFlow UI
├── docker-compose.yml
└── .env.example
```
