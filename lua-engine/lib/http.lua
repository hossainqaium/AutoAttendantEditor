-- =============================================================================
-- IVR Studio: HTTP Client with Timeout
-- /usr/share/freeswitch/scripts/ivr_studio/lib/http.lua
-- =============================================================================
-- Uses LuaSocket (bundled with FreeSWITCH — no installation required).
-- Hard cap of 8 seconds to prevent blocking FS worker threads.
-- Supports GET/POST, custom headers, JSON body.
-- =============================================================================

local http_lib  = require("socket.http")
local https_lib = require("ssl.https")  -- luasec, available on most FS installs
local ltn12     = require("ltn12")
local socket    = require("socket")
local json      = require("cjson.safe")

local M = {}

local HARD_TIMEOUT_SECS = 8  -- absolute maximum regardless of node config

-- ---------------------------------------------------------------------------
-- request(opts) → result, err
--
-- opts = {
--   url        = string (required),
--   method     = "GET" | "POST" | "PUT" | "DELETE" (default: "GET"),
--   headers    = { [string] = string },
--   body       = string | nil,
--   timeout    = number (milliseconds, capped at HARD_TIMEOUT_SECS * 1000),
-- }
--
-- Returns:
--   result = { status=number, headers={}, body=string }  on success
--   err    = "timeout" | "ssl_error" | "connect_refused" | string  on failure
-- ---------------------------------------------------------------------------
function M.request(opts)
    local url     = opts.url or ""
    local method  = (opts.method or "GET"):upper()
    local headers = opts.headers or {}
    local body    = opts.body
    local timeout_ms = opts.timeout or 3000
    local timeout_secs = math.min(timeout_ms, HARD_TIMEOUT_SECS * 1000) / 1000

    if url == "" then
        return nil, "empty_url"
    end

    local resp_body = {}
    local req = {
        url     = url,
        method  = method,
        headers = headers,
        sink    = ltn12.sink.table(resp_body),
    }

    if body then
        req.source = ltn12.source.string(body)
        req.headers["content-length"] = tostring(#body)
        if not req.headers["content-type"] then
            req.headers["content-type"] = "application/json"
        end
    end

    -- Select HTTP vs HTTPS
    local lib = http_lib
    if url:sub(1, 5) == "https" then
        lib = https_lib
        req.verify = "none"  -- set to "peer" with CA bundle in production
    end

    -- Apply timeout
    socket.settimeout(timeout_secs)

    local status, resp_headers, err
    local ok, call_err = pcall(function()
        local result
        result, status, resp_headers = lib.request(req)
        if result == nil then
            err = status  -- socket.http returns (nil, error_string) on failure
        end
    end)

    if not ok then
        local msg = tostring(call_err or "unknown")
        if msg:find("timeout") or msg:find("timed out") then
            return nil, "timeout"
        end
        return nil, msg
    end

    if err then
        if tostring(err):find("timeout") then return nil, "timeout" end
        return nil, tostring(err)
    end

    if not status then
        return nil, "no_response"
    end

    local body_str = table.concat(resp_body)

    return {
        status  = tonumber(status) or 0,
        headers = resp_headers or {},
        body    = body_str,
    }, nil
end

-- ---------------------------------------------------------------------------
-- request_json(opts) → parsed_table, err
-- Convenience wrapper that decodes the JSON response body automatically.
-- ---------------------------------------------------------------------------
function M.request_json(opts)
    local result, err = M.request(opts)
    if err then return nil, err end
    if not result.body or result.body == "" then
        return nil, "empty_response_body"
    end
    local data, json_err = json.decode(result.body)
    if not data then
        return nil, "invalid_json: " .. tostring(json_err)
    end
    return data, nil, result.status
end

return M
