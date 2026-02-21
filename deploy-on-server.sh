#!/usr/bin/env bash
# =============================================================================
# IVR Studio — Run this script DIRECTLY on the FusionPBX server
#
# Steps:
#   1. Copy this file and the two payload files to your FusionPBX server:
#        scp deploy-on-server.sh root@192.168.0.113:/tmp/
#        scp db/migrations/001_ivr_studio_schema.sql root@192.168.0.113:/tmp/
#        scp -r lua-engine root@192.168.0.113:/tmp/ivr_studio_lua
#
#   2. SSH into the server and run:
#        chmod +x /tmp/deploy-on-server.sh
#        bash /tmp/deploy-on-server.sh
# =============================================================================

set -euo pipefail

# ── Configuration — edit these if your install differs ───────────────────────
DB_NAME="fusionpbx"
DB_USER="fusionpbx"
DB_PASSWORD="d5PIZjYdWDFlVdIM7PO8HiANGw"
IVR_SECRET_KEY="0ba95e3be4795e27fe5824caccc78d69eea65a9c01d72b684ae8940609c4e668"
SCRIPTS_DIR="/usr/share/freeswitch/scripts"
VARS_XML="/etc/freeswitch/vars.xml"
SQL_FILE="/tmp/001_ivr_studio_schema.sql"
LUA_SRC="/tmp/ivr_studio_lua"
# ─────────────────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   IVR Studio — Server-side Deployment                ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Run database migration ───────────────────────────────────────────
echo "▶  Step 1/3 — Running database migration …"

if [[ ! -f "$SQL_FILE" ]]; then
  echo "   ERROR: $SQL_FILE not found."
  echo "   Copy it with:  scp db/migrations/001_ivr_studio_schema.sql root@\$(hostname):/tmp/"
  exit 1
fi

PGPASSWORD="$DB_PASSWORD" psql \
  -h 127.0.0.1 \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -f "$SQL_FILE"

echo "   ✓ Migration complete."
echo ""

# ── Step 2: Deploy Lua engine ────────────────────────────────────────────────
echo "▶  Step 2/3 — Deploying Lua engine to $SCRIPTS_DIR/ivr_studio …"

if [[ ! -d "$LUA_SRC" ]]; then
  echo "   ERROR: $LUA_SRC directory not found."
  echo "   Copy it with:  scp -r lua-engine root@\$(hostname):/tmp/ivr_studio_lua"
  exit 1
fi

mkdir -p "$SCRIPTS_DIR/ivr_studio/lib"
cp "$LUA_SRC/ivr_interpreter.lua" "$SCRIPTS_DIR/ivr_studio/"
cp "$LUA_SRC/lib/db.lua"          "$SCRIPTS_DIR/ivr_studio/lib/"
cp "$LUA_SRC/lib/http.lua"        "$SCRIPTS_DIR/ivr_studio/lib/"
cp "$LUA_SRC/lib/logger.lua"      "$SCRIPTS_DIR/ivr_studio/lib/"

echo "   ✓ Lua files deployed."
echo ""

# ── Step 3: Inject global vars into FreeSWITCH vars.xml ─────────────────────
echo "▶  Step 3/3 — Checking $VARS_XML …"

IVR_DSN="pgsql://hostaddr=127.0.0.1 dbname=${DB_NAME} user=${DB_USER} password=${DB_PASSWORD}"

if grep -q "ivr_studio_db_dsn" "$VARS_XML" 2>/dev/null; then
  echo "   ✓ IVR Studio vars already present — skipping."
else
  # Insert before the closing </include> tag
  sed -i "s|</include>|  <!-- IVR Studio -->\n  <X-PRE-PROCESS cmd=\"set\" data=\"ivr_studio_db_dsn=${IVR_DSN}\"/>\n  <X-PRE-PROCESS cmd=\"set\" data=\"ivr_secret_key=${IVR_SECRET_KEY}\"/>\n\n</include>|" "$VARS_XML"
  echo "   ✓ vars.xml updated."

  echo ""
  echo "   Reloading FreeSWITCH XML …"
  if command -v fs_cli &>/dev/null; then
    fs_cli -x "reloadxml" && echo "   ✓ reloadxml done."
  else
    echo "   ⚠  fs_cli not in PATH. Run manually:  fs_cli -x 'reloadxml'"
  fi
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              Server Deployment Complete!              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Lua engine:  $SCRIPTS_DIR/ivr_studio/"
echo "  DB schema:   ivr_studio.* in $DB_NAME"
echo ""
echo "  Next: start the API server and Studio UI from your Mac:"
echo "    cd api-server && npm start"
echo "    cd studio-ui  && npm run dev"
echo "    Open http://localhost:5173"
echo ""
