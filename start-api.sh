#!/bin/bash
# IVR Studio API Server — start/restart script
# Usage: ./start-api.sh
# Keeps server alive: restarts on crash, logs to api-server.log

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$SCRIPT_DIR/api-server"
LOG_FILE="$SCRIPT_DIR/api-server.log"
PID_FILE="$SCRIPT_DIR/api-server.pid"

# Kill existing instance if running
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  kill "$OLD_PID" 2>/dev/null && echo "Stopped old API server (pid $OLD_PID)"
  rm -f "$PID_FILE"
fi
# Also kill anything on port 3002
lsof -ti :3002 | xargs kill -9 2>/dev/null

echo "Starting IVR Studio API Server..."
echo "Log: $LOG_FILE"

cd "$API_DIR"

# Run in a keep-alive loop so crashes auto-restart
while true; do
  node src/index.js >> "$LOG_FILE" 2>&1
  EXIT=$?
  echo "[$(date)] API server exited with code $EXIT — restarting in 3s..." >> "$LOG_FILE"
  sleep 3
done &

LOOP_PID=$!
echo $LOOP_PID > "$PID_FILE"
echo "API server started (loop pid $LOOP_PID)"
echo "To stop: kill \$(cat '$PID_FILE') && lsof -ti :3002 | xargs kill"
