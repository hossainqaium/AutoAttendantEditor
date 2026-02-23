#!/usr/bin/env bash
# =============================================================================
# IVR Studio — Complete FusionPBX/FreeSWITCH Server Setup
#
# Applies ALL server-side changes needed to run IVR Studio on a fresh
# FusionPBX installation. Idempotent — safe to run more than once.
#
# USAGE (run directly ON the FusionPBX server, or via SSH from your Mac):
#
#   On the server:
#     chmod +x server-setup.sh
#     sudo bash server-setup.sh
#
#   From your Mac via SSH (password auth):
#     sshpass -p 'PASSWORD' ssh USER@SERVER_IP 'bash -s' < server-setup.sh
#
# PREREQUISITES:
#   - This script must run as root (or with sudo)
#   - The following files must be available (same directory or /tmp):
#       db/migrations/001_ivr_studio_schema.sql
#       lua-engine/ivr_interpreter.lua
#       lua-engine/lib/db.lua
#       lua-engine/lib/http.lua
#       lua-engine/lib/logger.lua
#   - sshpass (only if running remotely with password auth)
#
# CONFIGURATION — edit the variables in the "Config" section below.
# =============================================================================

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "  ${GREEN}✓${RESET}  $*"; }
info() { echo -e "  ${CYAN}→${RESET}  $*"; }
warn() { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
err()  { echo -e "  ${RED}✗${RESET}  $*" >&2; exit 1; }
step() { echo -e "\n${BOLD}▶ $*${RESET}"; }

# =============================================================================
# ── CONFIGURATION — edit these to match your FusionPBX install ───────────────
# =============================================================================

DB_NAME="${DB_NAME:-fusionpbx}"
DB_USER="${DB_USER:-fusionpbx}"
DB_PASSWORD="${DB_PASSWORD:-}"               # Required — set via env or edit here
DB_HOST="${DB_HOST:-127.0.0.1}"             # Always 127.0.0.1 on the server itself

# AES-256-GCM key for API-call node secrets (64 hex chars = 32 bytes)
# Generate with:  openssl rand -hex 32
IVR_SECRET_KEY="${IVR_SECRET_KEY:-}"        # Required — set via env or edit here

SCRIPTS_DIR="${SCRIPTS_DIR:-/usr/share/freeswitch/scripts}"
VARS_XML="${VARS_XML:-/etc/freeswitch/vars.xml}"
LUA_CONF="${LUA_CONF:-/etc/freeswitch/autoload_configs/lua.conf.xml}"
FPBX_CONFIG="${FPBX_CONFIG:-/etc/fusionpbx/config.conf}"
FAIL2BAN_JAIL="${FAIL2BAN_JAIL:-/etc/fail2ban/jail.local}"

# Optional: IP address(es) to whitelist in firewall (space-separated)
ADMIN_IPS="${ADMIN_IPS:-}"                   # e.g. "192.168.0.105 10.0.0.1"

# Script/project root (auto-detected)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# =============================================================================
# ── VALIDATION ────────────────────────────────────────────────────────────────
# =============================================================================

header() {
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}║    IVR Studio — FusionPBX/FreeSWITCH Server Setup       ║${RESET}"
  echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}"
  echo ""
}

header

# Must be root
if [[ $EUID -ne 0 ]]; then
  err "This script must be run as root. Use: sudo bash server-setup.sh"
fi

# Check required variables
if [[ -z "$DB_PASSWORD" ]]; then
  # Try to read from FusionPBX config
  if [[ -f "$FPBX_CONFIG" ]]; then
    DB_PASSWORD=$(grep 'database.0.password' "$FPBX_CONFIG" 2>/dev/null | awk -F'=' '{print $2}' | tr -d ' \r' || true)
    [[ -n "$DB_PASSWORD" ]] && info "Auto-detected DB_PASSWORD from $FPBX_CONFIG"
  fi
  [[ -z "$DB_PASSWORD" ]] && err "DB_PASSWORD is not set. Export it or edit the CONFIG section."
fi

if [[ -z "$IVR_SECRET_KEY" ]]; then
  warn "IVR_SECRET_KEY not set — generating a random one..."
  IVR_SECRET_KEY=$(openssl rand -hex 32)
  warn "Generated key: $IVR_SECRET_KEY"
  warn "SAVE THIS KEY — you'll need it in api-server/.env as IVR_SECRET_KEY"
fi

# Locate project files (look in script dir, /tmp, and /tmp/ivr_studio_deploy)
find_file() {
  local name="$1"; local try
  for try in \
    "$SCRIPT_DIR/$name" \
    "/tmp/$name" \
    "/tmp/ivr_studio_deploy/$name" \
    "/tmp/ivr_studio_lua/${name##*/}"; do
    [[ -f "$try" ]] && echo "$try" && return
  done
  echo ""
}

SQL_FILE=$(find_file "db/migrations/001_ivr_studio_schema.sql")
INTERPRETER=$(find_file "lua-engine/ivr_interpreter.lua")
LIB_DB=$(find_file "lua-engine/lib/db.lua")
LIB_HTTP=$(find_file "lua-engine/lib/http.lua")
LIB_LOGGER=$(find_file "lua-engine/lib/logger.lua")

echo -e "  ${CYAN}Configuration:${RESET}"
echo "    DB               : $DB_USER@$DB_HOST/$DB_NAME"
echo "    Scripts dir      : $SCRIPTS_DIR"
echo "    SQL migration    : ${SQL_FILE:-NOT FOUND}"
echo "    Lua interpreter  : ${INTERPRETER:-NOT FOUND}"
echo "    Admin IPs        : ${ADMIN_IPS:-(none)}"
echo ""

# =============================================================================
# ── STEP 1: Install Lua packages ──────────────────────────────────────────────
# =============================================================================

step "Step 1/8 — Install required Lua packages"

PACKAGES_NEEDED=()
dpkg -l lua-cjson  &>/dev/null || PACKAGES_NEEDED+=("lua-cjson")
dpkg -l lua-socket &>/dev/null || PACKAGES_NEEDED+=("lua-socket")
dpkg -l lua-sec    &>/dev/null || PACKAGES_NEEDED+=("lua-sec")

if [[ ${#PACKAGES_NEEDED[@]} -gt 0 ]]; then
  info "Installing: ${PACKAGES_NEEDED[*]}"
  DEBIAN_FRONTEND=noninteractive apt-get install -y "${PACKAGES_NEEDED[@]}"
  ok "Packages installed: ${PACKAGES_NEEDED[*]}"
else
  ok "All Lua packages already installed (lua-cjson, lua-socket, lua-sec)"
fi

# =============================================================================
# ── STEP 2: Create cjson/safe.lua shim ────────────────────────────────────────
# =============================================================================

step "Step 2/8 — Deploy cjson/safe.lua shim"

create_shim() {
  local dest="$1"
  mkdir -p "$(dirname "$dest")"
  cat > "$dest" << 'LUAEOF'
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
LUAEOF
}

create_shim "/usr/share/lua/5.2/cjson/safe.lua"
create_shim "$SCRIPTS_DIR/cjson/safe.lua"
ok "cjson/safe.lua shim deployed to /usr/share/lua/5.2/cjson/ and $SCRIPTS_DIR/cjson/"

# =============================================================================
# ── STEP 3: Copy Lua library files into FreeSWITCH scripts tree ───────────────
# =============================================================================

step "Step 3/8 — Copy Lua library files into FreeSWITCH scripts tree"

LUA_SRC_BASE=""
for v in 5.2 5.1 5.3; do
  [[ -f "/usr/share/lua/$v/socket.lua" ]] && LUA_SRC_BASE="/usr/share/lua/$v" && break
done

if [[ -z "$LUA_SRC_BASE" ]]; then
  warn "Cannot find Lua source base under /usr/share/lua/ — skipping file copy"
  warn "This may cause runtime errors. Ensure lua-socket and lua-sec are installed."
else
  info "Lua source base: $LUA_SRC_BASE"

  copy_real() {
    local src="$1"; local dst="$2"
    # Resolve symlinks (the Debian packages use symlinks 5.2→5.1)
    local real_src
    real_src=$(readlink -f "$src" 2>/dev/null || echo "$src")
    if [[ -f "$real_src" ]]; then
      mkdir -p "$(dirname "$dst")"
      # Remove dangling symlinks before copying
      [[ -L "$dst" ]] && rm -f "$dst"
      cp "$real_src" "$dst"
    else
      warn "Source not found (skipping): $src"
    fi
  }

  # Root-level files
  copy_real "$LUA_SRC_BASE/socket.lua"  "$SCRIPTS_DIR/socket.lua"
  copy_real "$LUA_SRC_BASE/ltn12.lua"   "$SCRIPTS_DIR/ltn12.lua"
  copy_real "$LUA_SRC_BASE/mime.lua"    "$SCRIPTS_DIR/mime.lua"
  copy_real "$LUA_SRC_BASE/ssl.lua"     "$SCRIPTS_DIR/ssl.lua"

  # socket/ subdirectory
  for f in http.lua headers.lua url.lua tp.lua ftp.lua mbox.lua smtp.lua; do
    copy_real "$LUA_SRC_BASE/socket/$f" "$SCRIPTS_DIR/socket/$f"
  done

  # ssl/ subdirectory
  for f in https.lua options.lua; do
    copy_real "$LUA_SRC_BASE/ssl/$f" "$SCRIPTS_DIR/ssl/$f"
  done

  ok "Lua library files copied to $SCRIPTS_DIR"
fi

# =============================================================================
# ── STEP 4: Update lua.conf.xml ───────────────────────────────────────────────
# =============================================================================

step "Step 4/8 — Update FreeSWITCH lua.conf.xml"

if [[ ! -f "$LUA_CONF" ]]; then
  warn "$LUA_CONF not found — skipping lua.conf.xml update"
else
  # Detect the Lua 5.x C module path (architecture-aware)
  LUA_CMOD_PATH=""
  for try in \
    "/usr/lib/x86_64-linux-gnu/lua/5.2" \
    "/usr/lib/aarch64-linux-gnu/lua/5.2" \
    "/usr/lib/lua/5.2" \
    "/usr/local/lib/lua/5.2"; do
    [[ -f "$try/cjson.so" ]] && LUA_CMOD_PATH="$try" && break
  done

  LUA_SCRIPT_PATH=""
  for try in "/usr/share/lua/5.2" "/usr/share/lua/5.3" "/usr/share/lua/5.1"; do
    [[ -f "$try/socket.lua" ]] && LUA_SCRIPT_PATH="$try" && break
  done

  python3 << PYEOF
import re

with open('$LUA_CONF', 'r') as f:
    content = f.read()

changes = []
script_dir_line = '    <param name="script-directory" value="\$\${script_dir}/?.lua"/>'

# Add module-directory for C extensions
if '$LUA_CMOD_PATH' and '$LUA_CMOD_PATH/?.so' not in content:
    new_line = '    <param name="module-directory" value="$LUA_CMOD_PATH/?.so"/>'
    content = content.replace(script_dir_line, new_line + '\n' + script_dir_line)
    changes.append('Added module-directory: $LUA_CMOD_PATH/?.so')

# Add script-directory for system Lua pure-Lua files
if '$LUA_SCRIPT_PATH' and '$LUA_SCRIPT_PATH/?.lua' not in content:
    new_line2 = '    <param name="script-directory" value="$LUA_SCRIPT_PATH/?.lua"/>'
    content = content.replace(script_dir_line, new_line2 + '\n' + script_dir_line)
    changes.append('Added script-directory: $LUA_SCRIPT_PATH/?.lua')

# Deduplicate: keep only one occurrence of each active param line
lines = content.split('\n')
seen = set()
deduped = []
for line in lines:
    stripped = line.strip()
    if (stripped.startswith('<param name="module-directory"') or
        stripped.startswith('<param name="script-directory"')):
        if stripped in seen:
            continue
        seen.add(stripped)
    deduped.append(line)
content = '\n'.join(deduped)

with open('$LUA_CONF', 'w') as f:
    f.write(content)

if changes:
    for c in changes:
        print('  Added: ' + c)
else:
    print('  Already up to date')
PYEOF

  ok "lua.conf.xml updated"
fi

# =============================================================================
# ── STEP 5: Update FreeSWITCH vars.xml ───────────────────────────────────────
# =============================================================================

step "Step 5/8 — Update FreeSWITCH vars.xml"

IVR_DSN="pgsql://hostaddr=${DB_HOST} dbname=${DB_NAME} user=${DB_USER} password=${DB_PASSWORD}"

if [[ ! -f "$VARS_XML" ]]; then
  warn "$VARS_XML not found — skipping vars.xml update"
elif grep -q "ivr_studio_db_dsn" "$VARS_XML" 2>/dev/null; then
  ok "IVR Studio vars already present in vars.xml — skipping"
else
  sed -i "s|</include>|  <!-- IVR Studio -->\n  <X-PRE-PROCESS cmd=\"set\" data=\"ivr_studio_db_dsn=${IVR_DSN}\"/>\n  <X-PRE-PROCESS cmd=\"set\" data=\"ivr_secret_key=${IVR_SECRET_KEY}\"/>\n\n</include>|" "$VARS_XML"
  ok "vars.xml updated with ivr_studio_db_dsn and ivr_secret_key"
fi

# =============================================================================
# ── STEP 6: Deploy IVR Studio Lua engine ─────────────────────────────────────
# =============================================================================

step "Step 6/8 — Deploy IVR Studio Lua engine"

if [[ -z "$INTERPRETER" || -z "$LIB_DB" || -z "$LIB_HTTP" || -z "$LIB_LOGGER" ]]; then
  warn "IVR Studio Lua source files not found near this script or in /tmp."
  warn "Skipping Lua engine deployment."
  warn "To deploy manually, copy the files and re-run, or run deploy.sh from your Mac."
else
  mkdir -p "$SCRIPTS_DIR/ivr_studio/lib"
  mkdir -p "$SCRIPTS_DIR/ivr_studio/cjson"

  cp "$INTERPRETER" "$SCRIPTS_DIR/ivr_studio/ivr_interpreter.lua"
  cp "$LIB_DB"      "$SCRIPTS_DIR/ivr_studio/lib/db.lua"
  cp "$LIB_HTTP"    "$SCRIPTS_DIR/ivr_studio/lib/http.lua"
  cp "$LIB_LOGGER"  "$SCRIPTS_DIR/ivr_studio/lib/logger.lua"

  # Also place cjson shim inside ivr_studio tree as belt-and-suspenders
  cp "$SCRIPTS_DIR/cjson/safe.lua" "$SCRIPTS_DIR/ivr_studio/cjson/safe.lua"

  # Set ownership for FreeSWITCH process
  chown -R daemon:daemon "$SCRIPTS_DIR/ivr_studio" 2>/dev/null || true

  ok "Lua engine deployed to $SCRIPTS_DIR/ivr_studio/"
fi

# =============================================================================
# ── STEP 7: Run PostgreSQL schema migration ───────────────────────────────────
# =============================================================================

step "Step 7/8 — Run PostgreSQL schema migration"

if [[ -z "$SQL_FILE" ]]; then
  warn "SQL migration file not found."
  warn "Copy db/migrations/001_ivr_studio_schema.sql to the server and re-run,"
  warn "or run:  PGPASSWORD='...' psql -h 127.0.0.1 -U fusionpbx -d fusionpbx -f 001_ivr_studio_schema.sql"
else
  if PGPASSWORD="$DB_PASSWORD" psql \
      -h "$DB_HOST" \
      -U "$DB_USER" \
      -d "$DB_NAME" \
      -c "SELECT 1 FROM information_schema.schemata WHERE schema_name='ivr_studio'" \
      2>/dev/null | grep -q "1 row"; then
    ok "ivr_studio schema already exists — skipping migration (idempotent SQL is safe to re-run)"
  fi

  info "Running migration: $SQL_FILE"
  PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -f "$SQL_FILE" \
    && ok "Migration complete." \
    || warn "Migration exited non-zero (may already be applied — check output above)"
fi

# =============================================================================
# ── STEP 8: Fix FusionPBX config + firewall ───────────────────────────────────
# =============================================================================

step "Step 8/8 — Apply miscellaneous server fixes"

# 8a. Fix FusionPBX config.conf database host
if [[ -f "$FPBX_CONFIG" ]]; then
  CURRENT_DB_HOST=$(grep 'database.0.host' "$FPBX_CONFIG" 2>/dev/null | awk -F'=' '{print $2}' | tr -d ' \r' || true)
  if [[ "$CURRENT_DB_HOST" != "127.0.0.1" && -n "$CURRENT_DB_HOST" ]]; then
    info "Fixing FusionPBX config.conf: database.0.host $CURRENT_DB_HOST → 127.0.0.1"
    sed -i "s|database.0.host[[:space:]]*=.*|database.0.host = 127.0.0.1|" "$FPBX_CONFIG"
    ok "config.conf updated"

    # Restart PHP-FPM to clear stale DB connections
    if systemctl is-active --quiet php8.1-fpm 2>/dev/null; then
      systemctl restart php8.1-fpm
      ok "php8.1-fpm restarted"
    elif systemctl is-active --quiet php8.2-fpm 2>/dev/null; then
      systemctl restart php8.2-fpm
      ok "php8.2-fpm restarted"
    fi
  else
    ok "FusionPBX config.conf database host already set to 127.0.0.1"
  fi
fi

# 8b. Whitelist admin IPs in firewall
if [[ -n "$ADMIN_IPS" ]]; then
  for ip in $ADMIN_IPS; do
    if ! iptables -C INPUT -s "$ip" -j ACCEPT &>/dev/null 2>&1; then
      iptables -I INPUT 1 -s "$ip" -j ACCEPT
      iptables -I OUTPUT 1 -d "$ip" -j ACCEPT
      ok "iptables: whitelisted $ip"
    else
      ok "iptables: $ip already whitelisted"
    fi
  done

  # Persist rules
  if command -v iptables-save &>/dev/null; then
    mkdir -p /etc/iptables
    iptables-save > /etc/iptables/rules.v4 2>/dev/null && ok "iptables rules saved to /etc/iptables/rules.v4"
  fi

  # Add to fail2ban ignoreip if fail2ban is installed
  if [[ -f "$FAIL2BAN_JAIL" ]]; then
    for ip in $ADMIN_IPS; do
      if ! grep -q "$ip" "$FAIL2BAN_JAIL" 2>/dev/null; then
        if grep -q '^\[DEFAULT\]' "$FAIL2BAN_JAIL"; then
          sed -i "/^\[DEFAULT\]/a ignoreip = 127.0.0.1/8 ::1 $ip" "$FAIL2BAN_JAIL"
        else
          printf '\n[DEFAULT]\nignoreip = 127.0.0.1/8 ::1 %s\n' "$ip" >> "$FAIL2BAN_JAIL"
        fi
        ok "fail2ban: whitelisted $ip"
        systemctl reload fail2ban 2>/dev/null || true
      else
        ok "fail2ban: $ip already in ignoreip"
      fi
    done
  fi
fi

# =============================================================================
# ── STEP 9: Grant IVR Studio API write-access to recordings directory ─────────
# =============================================================================
#
# When the API server runs on a workstation (dev mode), it uploads audio files
# to the FusionPBX server via SFTP as the SSH admin user.  That user must be
# able to write to /var/lib/freeswitch/storage/recordings/.
# We achieve this by:
#   a) adding the admin user to the freeswitch group, and
#   b) making the recordings directory group-writable with the setgid bit so
#      newly-created sub-directories inherit the freeswitch group.
# =============================================================================

step "Step 9/9 — Configure recordings directory write access for API"

# Determine the SSH admin username (falls back to the user who ran the script
# or $SUDO_USER if invoked via sudo).
IVR_ADMIN_USER="${IVR_ADMIN_USER:-${SUDO_USER:-${USER:-}}}"

RECORDINGS_BASE="${FS_RECORDINGS_PATH:-/var/lib/freeswitch/storage/recordings}"
mkdir -p "$RECORDINGS_BASE"

# Make the directory group-writable and set the setgid bit so sub-directories
# inherit the freeswitch group automatically.
chown freeswitch:freeswitch "$RECORDINGS_BASE" 2>/dev/null || true
chmod g+ws "$RECORDINGS_BASE" 2>/dev/null || true
ok "Recordings directory configured: $RECORDINGS_BASE (group-writable)"

# Add the admin user to the freeswitch group if specified.
if [[ -n "$IVR_ADMIN_USER" ]] && id "$IVR_ADMIN_USER" &>/dev/null 2>&1; then
  usermod -aG freeswitch "$IVR_ADMIN_USER" 2>/dev/null || true
  ok "Added $IVR_ADMIN_USER to the freeswitch group"
  warn "Log out and back in as $IVR_ADMIN_USER (or reconnect SSH) for the group change to take effect"
else
  warn "Could not determine SSH admin user — set IVR_ADMIN_USER=<username> and re-run this script,"
  warn "or run manually on the server:"
  warn "  sudo usermod -aG freeswitch <YOUR_SSH_USER>"
  warn "  sudo chmod g+ws /var/lib/freeswitch/storage/recordings"
fi

# =============================================================================
# ── FINAL: Reload FreeSWITCH XML ─────────────────────────────────────────────
# =============================================================================

echo ""
info "Reloading FreeSWITCH XML config..."
if command -v fs_cli &>/dev/null; then
  fs_cli -x "reloadxml" && ok "FreeSWITCH XML reloaded"
else
  warn "fs_cli not found in PATH — reload manually: fs_cli -x 'reloadxml'"
fi

# =============================================================================
# ── DONE ─────────────────────────────────────────────────────────────────────
# =============================================================================

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║              Server Setup Complete!                      ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${GREEN}Packages:${RESET}     lua-cjson, lua-socket, lua-sec"
echo -e "  ${GREEN}Lua libs:${RESET}     $SCRIPTS_DIR/socket/, ssl/, cjson/"
echo -e "  ${GREEN}IVR engine:${RESET}   $SCRIPTS_DIR/ivr_studio/"
echo -e "  ${GREEN}DB schema:${RESET}    ivr_studio.* in $DB_NAME"
echo -e "  ${GREEN}FS config:${RESET}    vars.xml + lua.conf.xml updated"
echo ""
echo "  Next steps (from your workstation):"
echo "    1. Copy api-server/.env and set DB_HOST to this server's IP"
echo "    2. Start API server:  cd api-server && npm start"
echo "    3. Start Studio UI:   cd studio-ui  && npm run dev"
echo "    4. Open http://localhost:5173"
echo ""
if [[ "$IVR_SECRET_KEY" != "" ]]; then
  echo -e "  ${YELLOW}IMPORTANT — add this to api-server/.env:${RESET}"
  echo "    IVR_SECRET_KEY=$IVR_SECRET_KEY"
  echo ""
fi
