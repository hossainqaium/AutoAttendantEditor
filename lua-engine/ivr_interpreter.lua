-- =============================================================================
-- IVR Studio: Generic IVR Interpreter
-- /usr/share/freeswitch/scripts/ivr_studio/ivr_interpreter.lua
-- =============================================================================
-- Single script handles ALL IVR Studio flows.
-- NO per-IVR Lua generation. NO FreeSWITCH reload needed on flow changes.
--
-- Call entry: FusionPBX dialplan calls:
--   <action application="lua" data="ivr_studio/ivr_interpreter.lua"/>
--
-- Prerequisites (already available in FusionPBX):
--   - freeswitch.Dbh  (native FS DB pool)
--   - cjson           (bundled with FreeSWITCH)
--   - LuaSocket       (bundled with FreeSWITCH)
-- =============================================================================

-- Module path: FusionPBX sets scripts_dir in lua.conf.xml.
-- 'ivr_studio.lib.xxx' maps to scripts_dir/ivr_studio/lib/xxx.lua
package.path = package.path .. ";" ..
    (freeswitch.getGlobalVariable("scripts_dir") or "/usr/share/freeswitch/scripts") ..
    "/ivr_studio/?.lua;" ..
    (freeswitch.getGlobalVariable("scripts_dir") or "/usr/share/freeswitch/scripts") ..
    "/ivr_studio/lib/?.lua"

-- Load JSON library with multi-level fallback:
--   1. cjson.safe  (preferred – returns nil on error)
--   2. cjson        (wrap in pcall to get safe behaviour)
--   3. Inline minimal decoder (last resort)
local json
local ok
ok, json = pcall(require, "cjson.safe")
if not ok or not json then
  ok, json = pcall(require, "cjson")
  if ok and json then
    -- Make it behave like cjson.safe (return nil,err instead of throwing)
    local real_decode = json.decode
    local real_encode = json.encode
    json.decode = function(s)
      local d_ok, d_res = pcall(real_decode, s)
      if d_ok then return d_res else return nil, d_res end
    end
    json.encode = function(v)
      local e_ok, e_res = pcall(real_encode, v)
      if e_ok then return e_res else return nil, e_res end
    end
  else
    -- Absolute fallback – very minimal, handles simple flat objects only
    json = {}
    json.decode = function(s)
      if not s or s == "" then return nil end
      local ok2, v = pcall(load("return " .. s:gsub('(%b""):', function(k) return k..":" end)))
      return ok2 and v or nil
    end
    json.encode = function(v) return tostring(v) end
    freeswitch.consoleLog("WARNING", "[ivr_studio] No JSON library found – using minimal fallback\n")
  end
end

local db     = require("db")
local http   = require("http")
local logger = require("logger")

-- =============================================================================
-- CONSTANTS
-- =============================================================================
local MAX_NODE_HOPS  = 200   -- hard cap against infinite loops
local CACHE_TTL_SECS = 5     -- per-worker graph cache TTL (short to reduce stale-cache window)

-- =============================================================================
-- PER-WORKER GRAPH CACHE
-- Lives in Lua module state — survives across calls on the same FS worker thread.
-- Not shared across workers; each worker warms independently.
--
-- Cache entry stores both the graph AND the published version_id.
-- On each call we do one fast SELECT version_id query; if the version changed
-- (i.e. the flow was re-published) the cache is immediately invalidated even
-- before the TTL expires, guaranteeing all workers pick up new graphs quickly.
-- =============================================================================
local graph_cache = {}

-- cache_get(flow_id, current_version_id):
--   current_version_id — the version_id just fetched from DB (lightweight query).
--   Returns the cached graph if still valid, or nil if expired / version changed.
local function cache_get(flow_id, current_version_id)
    local entry = graph_cache[flow_id]
    if not entry then return nil end
    -- Immediate invalidation if the published version changed
    if current_version_id and entry.version_id ~= current_version_id then
        graph_cache[flow_id] = nil
        return nil
    end
    -- TTL-based expiry
    if (os.time() - entry.loaded_at) >= CACHE_TTL_SECS then
        graph_cache[flow_id] = nil
        return nil
    end
    return entry.graph
end

local function cache_set(flow_id, graph, version_id)
    graph_cache[flow_id] = { graph = graph, loaded_at = os.time(), version_id = version_id }
end

-- Invalidate a specific flow's cache entry
local function cache_invalidate(flow_id)
    graph_cache[flow_id] = nil
end

-- =============================================================================
-- JSON PATH RESOLVER
-- Supports simple dot-notation: $.customer.name → data["customer"]["name"]
-- =============================================================================
local function resolve_json_path(data, path)
    if not path or not data then return nil end
    local parts = {}
    -- Strip leading $. and split on dots
    local clean = path:gsub("^%$%.?", "")
    for part in clean:gmatch("[^%.]+") do
        table.insert(parts, part)
    end
    local cur = data
    for _, part in ipairs(parts) do
        if type(cur) ~= "table" then return nil end
        cur = cur[part]
    end
    return cur
end

-- =============================================================================
-- TEMPLATE INTERPOLATION
-- Replaces {{variable_name}} placeholders with values from ivr_vars.
-- =============================================================================
local function interpolate(str, ivr_vars)
    if type(str) ~= "string" then return str end
    return str:gsub("{{([^}]+)}}", function(var_name)
        local val = ivr_vars[var_name:match("^%s*(.-)%s*$")]
        return val ~= nil and tostring(val) or ""
    end)
end

-- =============================================================================
-- SESSION BOOTSTRAP
-- =============================================================================
session:answer()
session:setAutoHangup(false)

-- FusionPBX's XML handler sets domain_uuid before we run — no lookup needed.
local domain_uuid = session:getVariable("domain_uuid") or ""
local dnis        = session:getVariable("destination_number") or
                    session:getVariable("dialed_ext") or ""
local ani         = session:getVariable("caller_id_number") or ""
local call_uuid   = session:getVariable("uuid") or tostring(os.time())

local log = logger.new(call_uuid, call_uuid, domain_uuid)
log:info("IVR Studio call started", { dnis = dnis, ani = ani })

if domain_uuid == "" then
    log:error("domain_uuid not set — check FusionPBX dialplan context")
    session:execute("playback", "ivr/ivr-call_cannot_be_completed_as_dialed.wav")
    session:hangup("NORMAL_CLEARING")
    return
end

-- =============================================================================
-- STEP 1: Resolve DID → flow_id
-- =============================================================================
local route_sql = string.format(
    "SELECT flow_id FROM ivr_studio.ivr_did_routes " ..
    "WHERE domain_uuid = %s AND destination = %s AND enabled = true LIMIT 1",
    db.escape_uuid(domain_uuid),
    db.escape(dnis)
)
local route_row = db.query_one(route_sql)

if not route_row then
    log:error("No IVR Studio route for DID", { dnis = dnis })
    session:execute("playback", "ivr/ivr-this_is_not_a_working_number.wav")
    session:hangup("UNALLOCATED_NUMBER")
    return
end

local flow_id = route_row.flow_id
log:info("Route resolved", { flow_id = flow_id })

-- =============================================================================
-- STEP 2: Load execution graph (with per-worker cache + version invalidation)
-- =============================================================================

-- Lightweight query — only fetches the UUID, not the full execution_graph JSON.
-- Used to detect whether the flow was re-published since we last cached it.
local ver_check_sql = string.format(
    "SELECT version_id FROM ivr_studio.ivr_versions " ..
    "WHERE flow_id = %s AND domain_uuid = %s AND status = 'published' LIMIT 1",
    db.escape_uuid(flow_id),
    db.escape_uuid(domain_uuid)
)
local ver_check = db.query_one(ver_check_sql)

if not ver_check then
    log:error("No published IVR version found", { flow_id = flow_id })
    session:execute("playback", "ivr/ivr-call_cannot_be_completed_as_dialed.wav")
    session:hangup("NORMAL_CLEARING")
    return
end

local current_version_id = ver_check.version_id
local graph      = cache_get(flow_id, current_version_id)
local version_id = current_version_id  -- tracked for call_log

if not graph then
    -- Cache miss (expired, invalidated, or first call) — load full graph
    local ver_sql = string.format(
        "SELECT execution_graph FROM ivr_studio.ivr_versions " ..
        "WHERE version_id = %s LIMIT 1",
        db.escape_uuid(current_version_id)
    )
    local ver_row = db.query_one(ver_sql)

    if not ver_row then
        log:error("Failed to load execution_graph", { version_id = current_version_id })
        session:hangup("NORMAL_CLEARING")
        return
    end

    local decode_err
    graph, decode_err = json.decode(ver_row.execution_graph)
    if not graph then
        log:error("Corrupt execution_graph JSON", { flow_id = flow_id, err = decode_err })
        session:hangup("NORMAL_CLEARING")
        return
    end

    cache_set(flow_id, graph, current_version_id)
    log:info("Graph loaded from DB", { flow_id = flow_id, version = version_id })
else
    log:info("Graph served from cache", { flow_id = flow_id, version = version_id })
end

-- Validate graph structure
if not graph.entry_node or not graph.nodes then
    log:error("Invalid graph structure — missing entry_node or nodes", { flow_id = flow_id })
    session:hangup("NORMAL_CLEARING")
    return
end

-- =============================================================================
-- STEP 3: Initialize per-call IVR variable scope
-- =============================================================================
local ivr_vars = {
    ani         = ani,
    dnis        = dnis,
    domain_uuid = domain_uuid,
    flow_id     = flow_id,
    call_uuid   = call_uuid,
}

-- Node execution trace for call logging
local node_trace = {}
local api_call_log = {}

-- =============================================================================
-- NODE HANDLERS
-- Each handler(config, ivr_vars) → output_label, terminal_signal
--   output_label:   string key in node.outputs to follow next (e.g. "next", "1", "true")
--   terminal_signal: non-nil string means call ended (e.g. "hangup", "transferred")
-- =============================================================================
local handlers = {}

-- ---------------------------------------------------------------------------
-- PLAY AUDIO
-- ---------------------------------------------------------------------------
handlers["play_audio"] = function(cfg)
    -- file_var: name of an ivr_var containing the path (for dynamic audio)
    -- file:     static file path
    local file = (cfg.file_var and ivr_vars[cfg.file_var]) or cfg.file
    file = file and interpolate(file, ivr_vars)
    if not file or file == "" then
        log:warn("play_audio: no file configured or variable empty", { cfg = cfg })
        return "next"
    end
    log:debug("play_audio", { file = file })
    session:execute("playback", file)
    return "next"
end

-- ---------------------------------------------------------------------------
-- GET DIGITS
-- ---------------------------------------------------------------------------
handlers["get_digits"] = function(cfg)
    local timeout_ms      = cfg.timeout_ms or 5000
    local min_digits      = cfg.min_digits or 1
    local max_digits      = cfg.max_digits or 1
    local retries         = cfg.retries or 3
    local prompt_file     = cfg.prompt_file and interpolate(cfg.prompt_file, ivr_vars)
                            or "silence_stream://200"
    -- no_input_audio plays after every failed attempt (no input OR invalid digit)
    local no_input_audio  = (cfg.no_input_audio and cfg.no_input_audio ~= "" and interpolate(cfg.no_input_audio, ivr_vars))
                            or (cfg.invalid_audio and cfg.invalid_audio ~= "" and interpolate(cfg.invalid_audio, ivr_vars))
                            or ""
    local welcome_audio   = cfg.welcome_audio and cfg.welcome_audio ~= "" and interpolate(cfg.welcome_audio, ivr_vars) or ""
    local timed_out_audio = cfg.timed_out_audio and cfg.timed_out_audio ~= "" and interpolate(cfg.timed_out_audio, ivr_vars) or ""
    local valid_digits    = cfg.valid_digits  -- optional table of valid digit strings
    local var_name        = "ivr_dtmf_" .. call_uuid

    -- 1. Welcome audio — plays once at the very start, before any prompt
    if welcome_audio ~= "" then
        session:execute("playback", welcome_audio)
    end

    local last_failure = "timeout"  -- "timeout" = no input, "invalid" = wrong digit

    for attempt = 1, retries do
        -- Clear any stale DTMF value left from the previous attempt
        session:setVariable(var_name, "")

        -- 2. Prompt audio — plays each attempt while FreeSWITCH waits for DTMF
        local read_str = string.format("%d %d %s %s %d #",
            min_digits, max_digits, prompt_file, var_name, timeout_ms)
        session:execute("read", read_str)

        local digit = session:getVariable(var_name)
        if digit and digit ~= "" then
            -- Validate against valid_digits list (if configured)
            local is_valid = true
            if valid_digits and type(valid_digits) == "table" and #valid_digits > 0 then
                is_valid = false
                for _, v in ipairs(valid_digits) do
                    if tostring(v) == tostring(digit) then
                        is_valid = true
                        break
                    end
                end
            end

            if is_valid then
                ivr_vars["last_digits"] = digit
                log:info("get_digits: valid input", { digit = digit, attempt = attempt })
                return tostring(digit)
            else
                last_failure = "invalid"
                log:info("get_digits: invalid digit", { digit = digit, attempt = attempt })
                -- 3. No-input audio — plays after every invalid digit (all attempts)
                if no_input_audio ~= "" then
                    session:execute("playback", no_input_audio)
                end
            end
        else
            last_failure = "timeout"
            log:info("get_digits: no input", { attempt = attempt, max = retries })
            -- 3. No-input audio — plays after every missed attempt (all attempts)
            if no_input_audio ~= "" then
                session:execute("playback", no_input_audio)
            end
        end
    end

    -- 4. Timed-out audio — plays once after all retries are exhausted
    if timed_out_audio ~= "" then
        session:execute("playback", timed_out_audio)
    end
    return last_failure  -- "timeout" or "invalid"
end

-- ---------------------------------------------------------------------------
-- API CALL
-- ---------------------------------------------------------------------------
handlers["api_call"] = function(cfg)
    local url    = interpolate(cfg.url or "", ivr_vars)
    local method = (cfg.method or "GET"):upper()
    local timeout_ms = cfg.timeout_ms or 3000

    if url == "" then
        log:error("api_call: empty URL")
        return "error"
    end

    -- Resolve headers — expand {{secret:key_name}} references
    local headers = {}
    for k, v in pairs(cfg.headers or {}) do
        local resolved = tostring(v):gsub("{{secret:([^}]+)}}", function(key_name)
            return db.get_secret(domain_uuid, key_name) or ""
        end)
        headers[k] = interpolate(resolved, ivr_vars)
    end

    -- Build request body from template
    local body = nil
    if cfg.body_template then
        local tpl_str
        if type(cfg.body_template) == "table" then
            tpl_str = json.encode(cfg.body_template)
        else
            tpl_str = tostring(cfg.body_template)
        end
        body = interpolate(tpl_str, ivr_vars)
    end

    local t_start = socket and socket.gettime and socket.gettime() or os.time()
    local result, err = http.request({
        url     = url,
        method  = method,
        headers = headers,
        body    = body,
        timeout = timeout_ms,
    })
    local latency_ms = math.floor(((socket and socket.gettime and socket.gettime() or os.time()) - t_start) * 1000)

    -- Record API call metrics
    table.insert(api_call_log, {
        url        = url,
        method     = method,
        latency_ms = latency_ms,
        status     = result and result.status or 0,
        err        = err,
    })

    if err == "timeout" then
        log:warn("api_call: timeout", { url = url, timeout_ms = timeout_ms })
        return "timeout"
    end

    if err then
        log:error("api_call: request error", { url = url, err = err })
        return "error"
    end

    if result.status >= 500 then
        log:error("api_call: server error", { url = url, status = result.status })
        return "error"
    end

    -- Parse JSON response
    local resp_data, json_err = json.decode(result.body or "")
    if not resp_data then
        log:warn("api_call: invalid JSON response", { url = url, err = json_err })
        return "error"
    end

    -- Extract variables from response using response_map
    for _, mapping in ipairs(cfg.response_map or {}) do
        local value = resolve_json_path(resp_data, mapping.json_path)
        if value ~= nil then
            ivr_vars[mapping.variable] = tostring(value)
            log:debug("api_call: extracted variable",
                { var = mapping.variable, val = tostring(value) })
        end
    end

    log:info("api_call: success", { url = url, status = result.status, latency_ms = latency_ms })
    return "success"
end

-- ---------------------------------------------------------------------------
-- CONDITION
-- ---------------------------------------------------------------------------
handlers["condition"] = function(cfg)
    local var_name = cfg.variable or ""
    local op       = cfg.operator or "eq"
    local cmp_val  = tostring(cfg.value or "")
    local act_val  = tostring(ivr_vars[var_name] or "")

    log:debug("condition", { var = var_name, op = op, actual = act_val, expected = cmp_val })

    local result
    if op == "eq"       then result = act_val == cmp_val
    elseif op == "neq"  then result = act_val ~= cmp_val
    elseif op == "gt"   then result = (tonumber(act_val) or 0) > (tonumber(cmp_val) or 0)
    elseif op == "lt"   then result = (tonumber(act_val) or 0) < (tonumber(cmp_val) or 0)
    elseif op == "gte"  then result = (tonumber(act_val) or 0) >= (tonumber(cmp_val) or 0)
    elseif op == "lte"  then result = (tonumber(act_val) or 0) <= (tonumber(cmp_val) or 0)
    elseif op == "contains"     then result = act_val:find(cmp_val, 1, true) ~= nil
    elseif op == "not_contains" then result = act_val:find(cmp_val, 1, true) == nil
    elseif op == "empty"        then result = act_val == ""
    elseif op == "not_empty"    then result = act_val ~= ""
    else result = false end

    return result and "true" or "false"
end

-- ---------------------------------------------------------------------------
-- TIME CONDITION
-- ---------------------------------------------------------------------------
handlers["time_condition"] = function(cfg)
    local sched = cfg.schedule or {}
    -- schedule = { open="09:00", close="17:00", days=[1,2,3,4,5] }
    -- days: 1=Sunday ... 7=Saturday (Lua os.date %w = 0-6)
    local now = os.date("*t")

    -- Day check
    if sched.days and #sched.days > 0 then
        local today = now.wday  -- 1=Sun, 7=Sat in Lua
        local day_match = false
        for _, d in ipairs(sched.days) do
            if tonumber(d) == today then day_match = true; break end
        end
        if not day_match then return "closed" end
    end

    -- Time window check
    if sched.open and sched.close then
        local open_h, open_m   = sched.open:match("(%d+):(%d+)")
        local close_h, close_m = sched.close:match("(%d+):(%d+)")
        if open_h and close_h then
            local open_mins  = tonumber(open_h)  * 60 + tonumber(open_m)
            local close_mins = tonumber(close_h) * 60 + tonumber(close_m)
            local now_mins   = now.hour * 60 + now.min
            if now_mins >= open_mins and now_mins < close_mins then
                return "open"
            end
        end
    end

    return "closed"
end

-- ---------------------------------------------------------------------------
-- SET VARIABLE
-- ---------------------------------------------------------------------------
handlers["set_variable"] = function(cfg)
    local key   = cfg.key or ""
    local value = interpolate(cfg.value, ivr_vars)
    if key ~= "" then
        ivr_vars[key] = value
        -- Also set as a channel variable so downstream FS apps can read it
        session:setVariable(key, tostring(value or ""))
        log:debug("set_variable", { key = key, value = value })
    end
    return "next"
end

-- ---------------------------------------------------------------------------
-- TRANSFER
-- ---------------------------------------------------------------------------
handlers["transfer"] = function(cfg)
    local dest    = interpolate(cfg.destination or "", ivr_vars)
    local xfer_type = cfg.transfer_type or "blind"
    local context = cfg.context or "default"

    if dest == "" then
        log:error("transfer: empty destination")
        return "failed"
    end

    log:info("transfer", { destination = dest, type = xfer_type })

    if xfer_type == "att" or xfer_type == "attended" then
        session:execute("att_xfer", dest)
    else
        -- Blind transfer: pass to FS dialplan
        session:execute("transfer", dest .. " XML " .. context)
    end
    return nil, "transferred"
end

-- ---------------------------------------------------------------------------
-- VOICEMAIL
-- ---------------------------------------------------------------------------
handlers["voicemail"] = function(cfg)
    local mailbox = interpolate(cfg.mailbox_id or dnis, ivr_vars)
    local domain  = session:getVariable("domain_name") or
                    session:getVariable("domain") or
                    freeswitch.getGlobalVariable("domain") or
                    "default"

    log:info("voicemail", { mailbox = mailbox, domain = domain })

    -- FusionPBX uses a Lua-based voicemail app (mod_voicemail is typically not loaded).
    -- Try FusionPBX's Lua voicemail first; fall back to native mod_voicemail if available.
    local lua_vm_path = "app/voicemail/index.lua"
    local vm_args     = string.format("default %s %s", domain, mailbox)

    local scripts_dir = freeswitch.getGlobalVariable("scripts_dir") or
                        "/usr/share/freeswitch/scripts"

    -- Check if the FusionPBX Lua voicemail script exists
    local f = io.open(scripts_dir .. "/" .. lua_vm_path, "r")
    if f then
        f:close()
        session:execute("lua", lua_vm_path .. " " .. vm_args)
    else
        -- Fallback: native mod_voicemail (if loaded)
        log:warn("FusionPBX voicemail script not found, trying native mod_voicemail",
                 { path = scripts_dir .. "/" .. lua_vm_path })
        session:execute("voicemail", vm_args)
    end

    return nil, "voicemail"
end

-- ---------------------------------------------------------------------------
-- HANGUP
-- ---------------------------------------------------------------------------
handlers["hangup"] = function(cfg)
    local cause = cfg.cause or "NORMAL_CLEARING"
    log:info("hangup", { cause = cause })
    session:hangup(cause)
    return nil, "hangup"
end

-- =============================================================================
-- MAIN EXECUTION LOOP (ITERATIVE — NO RECURSION)
-- =============================================================================
local current_node_id = graph.entry_node
local hops = 0
local call_start = os.time()

while current_node_id and session:ready() do
    hops = hops + 1

    -- Hard loop guard
    if hops > MAX_NODE_HOPS then
        log:error("MAX_NODE_HOPS exceeded — aborting to prevent infinite loop",
            { last_node = current_node_id, hops = hops })
        session:hangup("NORMAL_CLEARING")
        break
    end

    local node = graph.nodes[current_node_id]
    if not node then
        log:error("Node not found in graph", { node_id = current_node_id })
        session:hangup("NORMAL_CLEARING")
        break
    end

    local node_start = os.time()
    log:info("Executing node", { node_id = current_node_id, type = node.type, hop = hops })

    local handler = handlers[node.type]
    if not handler then
        log:error("Unknown node type", { type = node.type, node_id = current_node_id })
        -- Try error output, else hangup
        local err_next = node.outputs and node.outputs["error"]
        if err_next then
            current_node_id = err_next
        else
            session:hangup("NORMAL_CLEARING")
        end
        goto continue
    end

    -- pcall protects the main loop from any single node throwing
    local ok, output_label, terminal_signal = pcall(handler, node.config or {})

    -- Record node execution in trace
    table.insert(node_trace, {
        node_id      = current_node_id,
        type         = node.type,
        output_label = ok and output_label or "error",
        duration_ms  = (os.time() - node_start) * 1000,
    })

    if not ok then
        -- output_label contains the error message when pcall fails
        log:error("Node handler threw error",
            { node_id = current_node_id, type = node.type, err = output_label })
        local err_next = node.outputs and node.outputs["error"]
        if err_next then
            current_node_id = err_next
        else
            session:hangup("NORMAL_CLEARING")
            break
        end

    elseif terminal_signal then
        -- Node terminated the call (transfer, hangup, voicemail)
        log:info("Terminal node reached", { reason = terminal_signal, hops = hops })
        break

    else
        -- Follow the output edge
        local next_id = node.outputs and node.outputs[tostring(output_label)]
        if not next_id then
            log:info("No output edge — end of flow",
                { node_id = current_node_id, label = output_label })
            session:hangup("NORMAL_CLEARING")
            break
        end
        current_node_id = next_id
    end

    ::continue::
end

log:info("IVR Studio call completed",
    { hops = hops, duration_secs = os.time() - call_start })

-- =============================================================================
-- ASYNC CALL LOG (fire-and-forget INSERT — best effort, non-blocking)
-- =============================================================================
pcall(function()
    local trace_json, _ = json.encode(node_trace)
    local api_json, _   = json.encode(api_call_log)
    -- Use the actual version_id UUID if available, otherwise NULL
    local ver_id_sql = (version_id and version_id ~= "") and
                       db.escape_uuid(version_id) or "NULL"
    local log_sql = string.format(
        "INSERT INTO ivr_studio.call_logs " ..
        "(trace_id, domain_uuid, flow_id, version_id, call_uuid, ani, dnis, " ..
        " started_at, ended_at, disposition, node_trace, api_calls) " ..
        "VALUES (%s, %s, %s, %s, %s, %s, %s, " ..
        " NOW() - INTERVAL '%d seconds', NOW(), 'completed', %s::jsonb, %s::jsonb)",
        db.escape(call_uuid),
        db.escape_uuid(domain_uuid),
        db.escape_uuid(flow_id),
        ver_id_sql,
        db.escape(call_uuid),
        db.escape(ani),
        db.escape(dnis),
        os.time() - call_start,
        db.escape(trace_json or "[]"),
        db.escape(api_json or "[]")
    )
    db.execute(log_sql)
end)
