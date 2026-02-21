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
