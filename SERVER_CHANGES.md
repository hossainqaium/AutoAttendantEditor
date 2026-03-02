# IVR Studio — FusionPBX/FreeSWITCH Server Changes

This document records every change made to the FusionPBX/FreeSWITCH server to support
the IVR Studio system. Use `server-setup.sh` to replay all of these on a fresh server.

---

## 1. System Packages Installed

| Package | Version | Purpose |
|---------|---------|---------|
| `lua-cjson` | 2.1.0+dfsg-2.2 | JSON encode/decode for Lua (provides `cjson`, `cjson.safe`) |
| `lua-socket` | 3.1.0-1+b1 | HTTP/TCP socket library for Lua (provides `socket`, `socket.http`, `ltn12`, `mime`) |
| `lua-sec` | 1.2.0-2 | TLS/HTTPS support for Lua (provides `ssl`, `ssl.https`) |

```bash
apt-get install -y lua-cjson lua-socket lua-sec
```

---

## 2. Lua Module Shim — `cjson/safe.lua`

**Problem:** `lua-cjson` 2.1.0 installs `cjson.so` but does not ship a `cjson/safe.lua` shim.
FreeSWITCH's `mod_lua` does not include `/usr/share/lua/5.2/` in its default search path,
so the system Lua path is not automatically used.

**Fix:** A hand-written shim was placed in FreeSWITCH's scripts tree so `require('cjson.safe')`
resolves correctly:

**File created:** `/usr/share/freeswitch/scripts/cjson/safe.lua`

```lua
-- cjson.safe shim: wraps cjson to return nil+err instead of throwing
local cjson = require('cjson')
local M = {}
function M.encode(val)
  local ok, result = pcall(cjson.encode, val)
  if ok then return result else return nil, result end
end
function M.decode(str)
  local ok, result = pcall(cjson.decode, str)
  if ok then return result else return nil, result end
end
return M
```

The same file was also copied to `/usr/share/freeswitch/scripts/ivr_studio/cjson/safe.lua`
as a fallback.

---

## 3. Lua Library Files Copied into FreeSWITCH Scripts Tree

Because FreeSWITCH's `mod_lua` only searches `$script_dir` (not the system `/usr/share/lua/5.2/`
path) for pure-Lua `.lua` files, all required library Lua files were copied from the system
Lua install into `/usr/share/freeswitch/scripts/`.

### Root-level Lua files

| Destination | Source |
|-------------|--------|
| `/usr/share/freeswitch/scripts/socket.lua` | `/usr/share/lua/5.1/socket.lua` |
| `/usr/share/freeswitch/scripts/ltn12.lua` | `/usr/share/lua/5.2/ltn12.lua` |
| `/usr/share/freeswitch/scripts/mime.lua` | `/usr/share/lua/5.2/mime.lua` |
| `/usr/share/freeswitch/scripts/ssl.lua` | `/usr/share/lua/5.2/ssl.lua` |

### Subdirectory Lua files

| Destination | Source |
|-------------|--------|
| `/usr/share/freeswitch/scripts/socket/http.lua` | `/usr/share/lua/5.1/socket/http.lua` |
| `/usr/share/freeswitch/scripts/socket/headers.lua` | `/usr/share/lua/5.1/socket/headers.lua` |
| `/usr/share/freeswitch/scripts/socket/url.lua` | `/usr/share/lua/5.1/socket/url.lua` |
| `/usr/share/freeswitch/scripts/socket/tp.lua` | `/usr/share/lua/5.1/socket/tp.lua` |
| `/usr/share/freeswitch/scripts/socket/ftp.lua` | `/usr/share/lua/5.1/socket/ftp.lua` |
| `/usr/share/freeswitch/scripts/socket/mbox.lua` | `/usr/share/lua/5.1/socket/mbox.lua` |
| `/usr/share/freeswitch/scripts/socket/smtp.lua` | `/usr/share/lua/5.1/socket/smtp.lua` |
| `/usr/share/freeswitch/scripts/ssl/https.lua` | `/usr/share/lua/5.1/ssl/https.lua` |
| `/usr/share/freeswitch/scripts/ssl/options.lua` | `/usr/share/lua/5.1/ssl/options.lua` |

> **Note:** The `lua-socket` and `lua-sec` Debian packages install pure-Lua files as symlinks
> in the 5.2 tree that point back to the 5.1 tree. The actual file content lives in
> `/usr/share/lua/5.1/`. The copies in FreeSWITCH scripts are real files (not symlinks).

---

## 4. FreeSWITCH `lua.conf.xml` Modified

**File:** `/etc/freeswitch/autoload_configs/lua.conf.xml`

Two active `<param>` lines were added inside the `<settings>` block:

```xml
<!-- Added by IVR Studio setup — expose system Lua 5.2 C modules to mod_lua -->
<param name="module-directory" value="/usr/lib/x86_64-linux-gnu/lua/5.2/?.so"/>

<!-- Added by IVR Studio setup — expose system Lua 5.2 pure-Lua modules -->
<param name="script-directory" value="/usr/share/lua/5.2/?.lua"/>
```

The `module-directory` param tells FreeSWITCH where to find the C extension `.so` files:
- `cjson.so` → JSON
- `socket/core.so` → LuaSocket core
- `mime/core.so` → MIME encoding
- `ssl.so` → TLS/SSL

The `script-directory` param adds the system Lua pure-Lua path as a secondary search location.

---

## 5. IVR Studio Lua Engine Deployed

**Directory created:** `/usr/share/freeswitch/scripts/ivr_studio/`

| File | Purpose |
|------|---------|
| `ivr_studio/ivr_interpreter.lua` | Main entry point — handles ALL IVR flows generically, no per-flow Lua generation |
| `ivr_studio/lib/db.lua` | PostgreSQL helper using `freeswitch.Dbh` |
| `ivr_studio/lib/http.lua` | HTTP/HTTPS client (LuaSocket + LuaSec, 8s timeout) |
| `ivr_studio/lib/logger.lua` | Structured JSON call logger |
| `ivr_studio/cjson/safe.lua` | Optional shim for `cjson.safe` (see §2) |

**Source of truth:** The canonical Lua engine lives in the repo under `lua-engine/`. Deploy updates with:
```bash
# From project root
scp lua-engine/ivr_interpreter.lua user@server:/tmp/
ssh user@server "sudo cp /tmp/ivr_interpreter.lua /usr/share/freeswitch/scripts/ivr_studio/"
```

The interpreter uses a **3-level JSON fallback** in case `cjson.safe` is ever unavailable:
1. `require('cjson.safe')` — preferred (returns nil on error)
2. `require('cjson')` wrapped in `pcall` — safe fallback
3. Minimal inline Lua decoder — last resort

### 5.1 Execution graph cache (per-worker)

- Each FreeSWITCH Lua worker keeps an in-memory cache of the **published execution graph** per flow.
- **TTL:** 5 seconds (`CACHE_TTL_SECS`). After that, the next call reloads from the database.
- **Version invalidation:** On every call, the interpreter runs a lightweight `SELECT version_id` query. If the published version for that flow has changed (e.g. after re-publish from the Studio UI), the cache is discarded immediately and the full graph is loaded from `ivr_studio.ivr_versions`. This ensures **re-published flows take effect on the very next call** without waiting for TTL expiry.
- Cache is **not shared** across workers; each worker warms independently.

### 5.2 Get-Digits node behavior (audio order)

The `get_digits` handler in `ivr_interpreter.lua` plays audio in this order:

| Step | When | Config field |
|------|------|--------------|
| 1 | Once at the very start, before any prompt | `welcome_audio` |
| 2 | Each attempt — played by FreeSWITCH `read` app while waiting for DTMF | `prompt_file` |
| 3 | After **every** failed attempt (no input or invalid digit), including the last retry | `no_input_audio` (fallback: `invalid_audio`) |
| 4 | Once after all retries are exhausted, before routing to timeout/invalid | `timed_out_audio` |

- **Valid digits:** If `valid_digits` is set, only those digit strings are accepted; otherwise any digit ends the read. Invalid keypresses trigger `no_input_audio` and retry.
- **Outputs:** The handler returns the digit string (e.g. `"1"`, `"2"`) for valid input, or `"timeout"` / `"invalid"` when retries are exhausted.
- **Stale DTMF:** The digit variable is cleared with `session:setVariable(var_name, "")` before each `read` to avoid carrying over a previous attempt’s value.

---

## 6. FreeSWITCH `vars.xml` Modified

**File:** `/etc/freeswitch/vars.xml`

The following lines were injected before the closing `</include>` tag:

```xml
<!-- IVR Studio -->
<X-PRE-PROCESS cmd="set" data="ivr_studio_db_dsn=pgsql://hostaddr=127.0.0.1 dbname=fusionpbx user=fusionpbx password=YOUR_PASSWORD"/>
<X-PRE-PROCESS cmd="set" data="ivr_secret_key=YOUR_SECRET_KEY"/>
```

- `ivr_studio_db_dsn` — PostgreSQL connection string for the Lua engine (used by `freeswitch.Dbh`)
- `ivr_secret_key` — AES-256-GCM key for encrypting API node secrets stored in the DB

These variables are read at startup and available to all Lua scripts via
`freeswitch.getGlobalVariable("ivr_studio_db_dsn")`.

---

## 7. PostgreSQL Schema Migration

**Database:** `fusionpbx`  
**Schema created:** `ivr_studio`

Tables created:

| Table | Purpose |
|-------|---------|
| `ivr_studio.ivr_flows` | One row per IVR flow (name, domain, draft graph, published version pointer) |
| `ivr_studio.ivr_versions` | Immutable snapshots of the flow (execution_graph + raw_graph as JSONB); one row per publish |
| `ivr_studio.ivr_did_routes` | Maps DIDs/extensions to a flow (Lua uses this to resolve inbound calls) |
| `ivr_studio.flow_secrets` | Encrypted API credentials for API-call nodes ({{secret:key_name}}) |
| `ivr_studio.call_logs` | Per-call execution logs (trace_id, hops, node_trace, etc.) |

The `fusionpbx` database user was granted full privileges on the `ivr_studio` schema.

- **Migration file:** `db/migrations/001_ivr_studio_schema.sql`
- **Full schema reference:** See `DB_CHANGE.md` in this repo.

---

## 8. FusionPBX `config.conf` Fixed

**File:** `/etc/fusionpbx/config.conf`

| Setting | Before | After |
|---------|--------|-------|
| `database.0.host` | `192.168.0.113` (LAN IP) | `127.0.0.1` (loopback) |

**Reason:** PostgreSQL on this server only listens on `127.0.0.1` (not the LAN IP).
FusionPBX was configured to connect via the LAN IP, which caused the
`beginTransaction() on null` error on login. Changing to loopback fixes it.

After the change: `php8.1-fpm` was restarted to clear stale connections:
```bash
systemctl restart php8.1-fpm
```

---

## 9. Firewall / fail2ban — Whitelist Admin IP

The following iptables rules were added to permanently allow the admin machine
(IP: `192.168.0.105`) to bypass the firewall and fail2ban:

```bash
iptables -I INPUT 1 -s 192.168.0.105 -j ACCEPT
iptables -I OUTPUT 1 -d 192.168.0.105 -j ACCEPT
iptables-save > /etc/iptables/rules.v4
```

fail2ban whitelist added to `/etc/fail2ban/jail.local`:
```ini
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1 192.168.0.105
```

---

## 10. Dialplan Entries (Dynamic — Managed by API)

Dialplan entries are **not static files** — they are inserted into FusionPBX's
`public.v_dialplans` table by the IVR Studio API whenever a DID or extension is
assigned to a published flow.

Each entry has:
- `app_uuid = 'a1b2c3d4-...'` (IVR Studio marker UUID — used for cleanup on unassign)
- `dialplan_context` — either `'public'` (PSTN), the domain name (SIP internal), or both
- `dialplan_number` — the DID or extension number
- `dialplan_xml` — calls `lua ivr_studio/ivr_interpreter.lua`

These entries are created/deleted via the `POST /api/dids` and `DELETE /api/dids/:id`
API endpoints. No manual edits to dialplan XML files are required.

---

## Summary of File Changes

```
/etc/freeswitch/autoload_configs/lua.conf.xml   MODIFIED
/etc/freeswitch/vars.xml                         MODIFIED
/etc/fusionpbx/config.conf                       MODIFIED
/etc/fail2ban/jail.local                         MODIFIED
/etc/iptables/rules.v4                           MODIFIED

/usr/share/freeswitch/scripts/
  cjson/safe.lua                                 NEW (shim)
  socket.lua                                     NEW (copy)
  socket/http.lua                                NEW (copy)
  socket/headers.lua                             NEW (copy)
  socket/url.lua                                 NEW (copy)
  socket/tp.lua                                  NEW (copy)
  socket/ftp.lua                                 NEW (copy)
  socket/mbox.lua                                NEW (copy)
  socket/smtp.lua                                NEW (copy)
  ltn12.lua                                      NEW (copy)
  mime.lua                                       NEW (copy)
  ssl.lua                                        NEW (copy)
  ssl/https.lua                                  NEW (copy)
  ssl/options.lua                                NEW (copy)
  ivr_studio/ivr_interpreter.lua                 NEW (IVR engine)
  ivr_studio/lib/db.lua                          NEW (IVR engine)
  ivr_studio/lib/http.lua                        NEW (IVR engine)
  ivr_studio/lib/logger.lua                      NEW (IVR engine)
  ivr_studio/cjson/safe.lua                      NEW (shim copy)

PostgreSQL (fusionpbx database):
  Schema ivr_studio + 5 tables                   NEW (migration)
  Permissions granted to user fusionpbx          NEW
  public.v_dialplans entries                     DYNAMIC (via API)
```
