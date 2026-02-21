-- =============================================================================
-- IVR Studio: Database Access Layer
-- /usr/share/freeswitch/scripts/ivr_studio/lib/db.lua
-- =============================================================================
-- Uses freeswitch.Dbh — FreeSWITCH's native pooled DB handler.
-- NO external drivers needed. Already available in all FusionPBX installations.
-- dbh:release() returns connection to pool; does NOT close it.
-- =============================================================================

local M = {}

-- ---------------------------------------------------------------------------
-- DSN Configuration
-- freeswitch.Dbh uses the pgsql:// URI format.
-- Read from a FreeSWITCH global variable set in FusionPBX's vars.xml,
-- or fall back to a sensible default for standard FusionPBX installs.
-- ---------------------------------------------------------------------------
local function get_dsn()
    local dsn = freeswitch.getGlobalVariable("ivr_studio_db_dsn")
    if dsn and dsn ~= "" then return dsn end
    -- Standard FusionPBX install defaults:
    return "pgsql://hostaddr=127.0.0.1 dbname=fusionpbx user=fusionpbx password=fusionpbx"
end

-- ---------------------------------------------------------------------------
-- query_one(sql) → row | nil
-- Executes sql, returns first row as {col=val} table, or nil on miss/error.
-- SQL must have values pre-escaped (see escape() helper below).
-- ---------------------------------------------------------------------------
function M.query_one(sql)
    local dbh = freeswitch.Dbh(get_dsn())
    if not dbh:connected() then
        freeswitch.consoleLog("ERR", "[ivr_studio.db] DB connect failed\n")
        return nil
    end

    local result = nil
    local ok, err = pcall(function()
        dbh:query(sql, function(row)
            if result == nil then result = row end
        end)
    end)
    dbh:release()

    if not ok then
        freeswitch.consoleLog("ERR", "[ivr_studio.db] query error: " .. tostring(err) .. "\n")
        return nil
    end
    return result
end

-- ---------------------------------------------------------------------------
-- query_all(sql) → [{row}, ...] | {}
-- Returns all rows from a query.
-- ---------------------------------------------------------------------------
function M.query_all(sql)
    local dbh = freeswitch.Dbh(get_dsn())
    if not dbh:connected() then
        freeswitch.consoleLog("ERR", "[ivr_studio.db] DB connect failed\n")
        return {}
    end

    local rows = {}
    local ok, err = pcall(function()
        dbh:query(sql, function(row)
            table.insert(rows, row)
        end)
    end)
    dbh:release()

    if not ok then
        freeswitch.consoleLog("ERR", "[ivr_studio.db] query_all error: " .. tostring(err) .. "\n")
        return {}
    end
    return rows
end

-- ---------------------------------------------------------------------------
-- execute(sql) → boolean
-- Runs a non-SELECT statement (INSERT/UPDATE).
-- ---------------------------------------------------------------------------
function M.execute(sql)
    local dbh = freeswitch.Dbh(get_dsn())
    if not dbh:connected() then return false end
    local ok = pcall(function() dbh:query(sql) end)
    dbh:release()
    return ok
end

-- ---------------------------------------------------------------------------
-- escape(value) → escaped string safe for SQL string literals
-- Escapes single quotes. UUIDs and timestamps need no quoting beyond this.
-- ---------------------------------------------------------------------------
function M.escape(value)
    if value == nil then return "NULL" end
    return "'" .. tostring(value):gsub("'", "''") .. "'"
end

-- ---------------------------------------------------------------------------
-- escape_uuid(value) → validated UUID string or 'NULL'
-- Rejects any value that doesn't look like a UUID to prevent injection.
-- ---------------------------------------------------------------------------
function M.escape_uuid(value)
    if not value then return "NULL" end
    local v = tostring(value)
    if v:match("^[0-9a-fA-F%-]+$") and #v == 36 then
        return "'" .. v .. "'"
    end
    return "NULL"
end

-- ---------------------------------------------------------------------------
-- Secret cache: per-worker, in-process, persists across calls in same Lua state.
-- Secrets are fetched once and cached until FS worker restarts.
-- ---------------------------------------------------------------------------
local secret_cache = {}

function M.get_secret(domain_uuid, key_name)
    local cache_key = tostring(domain_uuid) .. ":" .. tostring(key_name)
    if secret_cache[cache_key] then return secret_cache[cache_key] end

    local sql = string.format(
        "SELECT encrypted_value FROM ivr_studio.flow_secrets " ..
        "WHERE domain_uuid = %s AND key_name = %s LIMIT 1",
        M.escape_uuid(domain_uuid),
        M.escape(key_name)
    )
    local row = M.query_one(sql)
    if row and row.encrypted_value then
        -- NOTE: In production, decrypt here using AES-256-GCM.
        -- Key retrieved from: freeswitch.getGlobalVariable("ivr_secret_key")
        -- For now, values are stored as plaintext during development.
        local val = row.encrypted_value
        secret_cache[cache_key] = val
        return val
    end
    return nil
end

-- ---------------------------------------------------------------------------
-- clear_secret_cache() — call after secrets are rotated (from ESL/API).
-- ---------------------------------------------------------------------------
function M.clear_secret_cache()
    secret_cache = {}
end

return M
