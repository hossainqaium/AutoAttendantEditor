#!/usr/bin/env bash
# =============================================================================
# IVR Studio — One-shot deployment script
# Runs the DB migration and deploys Lua files to FusionPBX over SSH.
# PostgreSQL port 5432 does NOT need to be open remotely.
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh [ssh-target]
#
# Examples:
#   ./deploy.sh root@192.168.0.113
#   ./deploy.sh                        # reads FUSIONPBX_HOST from .env
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/api-server/.env"

# ── Load .env ────────────────────────────────────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    # Skip blank lines and comments
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    # Must contain an = sign
    [[ "$line" != *=* ]] && continue
    key="${line%%=*}"
    val="${line#*=}"
    # Only export if not already set in environment
    if [[ -z "${!key+x}" ]]; then
      export "$key"="$val"
    fi
  done < "$ENV_FILE"
fi

# ── Resolve SSH target ────────────────────────────────────────────────────────
SSH_TARGET="${1:-${FUSIONPBX_SSH:-}}"

if [[ -z "$SSH_TARGET" ]]; then
  SSH_HOST="${DB_HOST:-}"
  if [[ -z "$SSH_HOST" ]]; then
    echo "ERROR: No SSH target provided."
    echo "Usage: ./deploy.sh root@192.168.0.113"
    echo "   or set FUSIONPBX_SSH=root@192.168.0.113 in api-server/.env"
    exit 1
  fi
  SSH_TARGET="root@${SSH_HOST}"
  echo "Using SSH target derived from DB_HOST: $SSH_TARGET"
fi

# ── Build SSH/SCP command wrappers ────────────────────────────────────────────
SSH_PASS="${FUSIONPBX_SSH_PASSWORD:-}"
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o BatchMode=no"

if [[ -n "$SSH_PASS" ]]; then
  # Use sshpass for password auth
  if ! command -v sshpass &>/dev/null; then
    echo "ERROR: sshpass is not installed but FUSIONPBX_SSH_PASSWORD is set."
    echo "Install it with:  brew install hudochenkov/sshpass/sshpass   (macOS)"
    echo "               or: apt-get install sshpass                    (Linux)"
    exit 1
  fi
  SSH_CMD="sshpass -p '$SSH_PASS' ssh $SSH_OPTS"
  SCP_CMD="sshpass -p '$SSH_PASS' scp -o StrictHostKeyChecking=accept-new"
else
  # Use key-based auth (default)
  SSH_CMD="ssh $SSH_OPTS"
  SCP_CMD="scp -o StrictHostKeyChecking=accept-new"
fi

DB_NAME="${DB_NAME:-fusionpbx}"
DB_USER="${DB_USER:-fusionpbx}"
DB_PASSWORD="${DB_PASSWORD:-}"
SCRIPTS_DIR="${FUSIONPBX_SCRIPTS_DIR:-/usr/share/freeswitch/scripts}"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║         IVR Studio — Deployment to FusionPBX         ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  SSH target  : $SSH_TARGET"
echo "  DB host     : ${DB_HOST:-127.0.0.1} (connected from server-side)"
echo "  DB name     : $DB_NAME"
echo "  DB user     : $DB_USER"
echo "  Scripts dir : $SCRIPTS_DIR/ivr_studio"
echo ""

# ── Step 1: Upload and run the SQL migration ─────────────────────────────────
echo "▶  Step 1/3 — Running database migration …"

SQL_FILE="$SCRIPT_DIR/db/migrations/001_ivr_studio_schema.sql"

# Upload the SQL file to a temp location on the server
eval $SSH_CMD "$SSH_TARGET" "mkdir -p /tmp/ivr_studio_deploy"
eval $SCP_CMD -q "$SQL_FILE" "$SSH_TARGET:/tmp/ivr_studio_deploy/001_ivr_studio_schema.sql"

# Run psql on the server (connects to localhost — no firewall issue)
eval $SSH_CMD "$SSH_TARGET" "PGPASSWORD='${DB_PASSWORD}' psql \
  -h 127.0.0.1 \
  -U '${DB_USER}' \
  -d '${DB_NAME}' \
  -f /tmp/ivr_studio_deploy/001_ivr_studio_schema.sql \
  && echo 'Migration complete.' \
  || echo 'Migration may have already been applied (IF NOT EXISTS used — this is safe).'"

echo "   ✓ Migration done."
echo ""

# ── Step 2: Deploy Lua engine files ──────────────────────────────────────────
echo "▶  Step 2/3 — Deploying Lua engine to $SCRIPTS_DIR/ivr_studio …"

eval $SSH_CMD "$SSH_TARGET" "mkdir -p '${SCRIPTS_DIR}/ivr_studio/lib'"

eval $SCP_CMD -q "$SCRIPT_DIR/lua-engine/ivr_interpreter.lua" \
       "$SSH_TARGET:${SCRIPTS_DIR}/ivr_studio/ivr_interpreter.lua"

eval $SCP_CMD -q "$SCRIPT_DIR/lua-engine/lib/db.lua" \
       "$SCRIPT_DIR/lua-engine/lib/http.lua" \
       "$SCRIPT_DIR/lua-engine/lib/logger.lua" \
       "$SSH_TARGET:${SCRIPTS_DIR}/ivr_studio/lib/"

echo "   ✓ Lua files deployed."
echo ""

# ── Step 3: Set FreeSWITCH global vars in vars.xml ───────────────────────────
echo "▶  Step 3/3 — Checking FreeSWITCH vars.xml …"

VARS_XML="/etc/freeswitch/vars.xml"
IVR_DSN="pgsql://hostaddr=127.0.0.1 dbname=${DB_NAME} user=${DB_USER} password=${DB_PASSWORD}"

# Check if ivr_studio vars already exist
ALREADY_SET=$(eval $SSH_CMD "$SSH_TARGET" "grep -c 'ivr_studio_db_dsn' '${VARS_XML}' 2>/dev/null || echo 0")

if [[ "$ALREADY_SET" -eq "0" ]]; then
  echo "   Adding IVR Studio variables to $VARS_XML …"
  eval $SSH_CMD "$SSH_TARGET" "sed -i 's|</include>|  <!-- IVR Studio -->\n  <X-PRE-PROCESS cmd=\"set\" data=\"ivr_studio_db_dsn=${IVR_DSN}\"/>\n  <X-PRE-PROCESS cmd=\"set\" data=\"ivr_secret_key=${IVR_SECRET_KEY:-REPLACE_WITH_KEY}\"/>\n\n</include>|' '${VARS_XML}'"
  echo "   ✓ vars.xml updated."

  echo ""
  echo "   Reloading FreeSWITCH XML (for vars.xml to take effect) …"
  eval $SSH_CMD "$SSH_TARGET" "fs_cli -x 'reloadxml' 2>/dev/null || echo '   (fs_cli not found — reload manually or restart FreeSWITCH)'"
  echo "   ✓ XML reloaded."
else
  echo "   ✓ IVR Studio vars already present in vars.xml — skipping."
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║                Deployment Complete!                   ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Next steps:"
echo "  1. Start the API server:  cd api-server && npm start"
echo "  2. Start the Studio UI:   cd studio-ui && npm run dev"
echo "  3. Open http://localhost:5173 in your browser"
echo "  4. Select your FusionPBX domain and create your first IVR flow"
echo ""
