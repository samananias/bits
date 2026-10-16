#!/bin/sh
set -e

echo "=========================================================="
echo "   BITS Attendance Management System & ZKTeco Simulator   "
echo "=========================================================="

# 1. Start the ZKTeco hardware simulator in the background (if enabled or not in prod)
if [ "$ENABLE_DEVICE_SIMULATOR" = "true" ] || [ "$NODE_ENV" != "production" ]; then
    echo "[Simulator] Starting ZKTeco Biometric Terminal Simulator..."
    cd /app/simulator
    ZK_TCP_PORT=${ZK_PORT:-4370} ZK_HTTP_PORT=${SIMULATOR_HTTP_PORT:-3030} node dist/index.js &
    SIM_PID=$!
    echo "[Simulator] Running in background (PID: $SIM_PID, TCP: ${ZK_PORT:-4370}, HTTP: ${SIMULATOR_HTTP_PORT:-3030})"

    # Give simulator 1 second to initialize and verify it did not exit
    sleep 1
    if ! kill -0 $SIM_PID 2>/dev/null; then
        echo "[Simulator] ERROR: Simulator process $SIM_PID exited prematurely!"
        exit 1
    fi
    echo "[Simulator] Verified alive and listening on TCP: ${ZK_PORT:-4370}"
else
    echo "[Simulator] Notice: Simulator disabled in production (ENABLE_DEVICE_SIMULATOR!=true). Skipping simulator startup."
fi

# 2. Deploy database migrations
echo "[Database] Verifying database migrations..."
cd /app/backend
# Neon best practice: use direct connection for migrations to avoid PgBouncer pooler lock timeout (P1002)
DIRECT_URL=$(echo "${DATABASE_URL:-}" | sed 's/-pooler\././')
DATABASE_URL="${DIRECT_URL:-$DATABASE_URL}" npx prisma migrate deploy || echo "[Database] Notice: migration check completed with non-fatal warning; proceeding with server startup."

# 3. Start the Express API Server
echo "[Backend] Starting Express API Server on port ${PORT:-3001}..."
exec npm run start
