-- =============================================================================
-- IVR Studio: Structured Logger
-- /usr/share/freeswitch/scripts/ivr_studio/lib/logger.lua
-- =============================================================================
-- Emits newline-delimited JSON to FreeSWITCH console log.
-- Each line is a complete JSON object parseable by Filebeat/Loki/Elasticsearch.
-- =============================================================================

local json = require("cjson.safe")
local M    = {}

--- Create a new logger bound to a call context.
-- @param trace_id   string  FreeSWITCH call UUID (used as trace identifier)
-- @param call_uuid  string  FreeSWITCH channel UUID
-- @param domain_uuid string FusionPBX domain UUID (tenant)
-- @return logger object with :info(), :warn(), :error() methods
function M.new(trace_id, call_uuid, domain_uuid)
    local self = {
        trace_id    = trace_id    or "unknown",
        call_uuid   = call_uuid   or "unknown",
        domain_uuid = domain_uuid or "unknown",
    }

    local function emit(fs_level, level_label, msg, ctx)
        ctx = ctx or {}
        -- Copy to avoid mutating the caller's table
        local entry = {}
        for k, v in pairs(ctx) do entry[k] = v end
        entry.app         = "ivr_studio"
        entry.trace_id    = self.trace_id
        entry.call_uuid   = self.call_uuid
        entry.domain_uuid = self.domain_uuid
        entry.level       = level_label
        entry.msg         = msg
        entry.ts          = os.date("!%Y-%m-%dT%H:%M:%SZ")

        local encoded, err = json.encode(entry)
        if not encoded then
            encoded = '{"app":"ivr_studio","level":"ERR","msg":"json_encode_failed","err":"' ..
                      tostring(err) .. '"}'
        end
        freeswitch.consoleLog(fs_level, encoded .. "\n")
    end

    function self:info(msg, ctx)  emit("INFO",    "INFO",  msg, ctx) end
    function self:warn(msg, ctx)  emit("WARNING", "WARN",  msg, ctx) end
    function self:error(msg, ctx) emit("ERR",     "ERROR", msg, ctx) end
    function self:debug(msg, ctx) emit("DEBUG",   "DEBUG", msg, ctx) end

    return self
end

return M
