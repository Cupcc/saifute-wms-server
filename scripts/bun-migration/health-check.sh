#!/usr/bin/env bash
# ============================================================
# Bun Migration Health Check Script
# 启动应用 → 检测 HTTP/DB/Redis → 输出报告 → 自动退出
# 用法: ./scripts/bun-migration/health-check.sh [bun|node]
# ============================================================
set -euo pipefail

RUNTIME="${1:-bun}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

ENV_FILE=".env.dev"
LOG_FILE="/tmp/bun-migration-health-${RUNTIME}-$(date +%Y%m%d%H%M%S).log"
REPORT_FILE="/tmp/bun-migration-health-report-$(date +%Y%m%d%H%M%S).txt"

# Read port from env file
PORT=$(grep -E "^PORT=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "3000")
PORT="${PORT:-3000}"
BASE_URL="http://localhost:${PORT}"

cleanup() {
  if [ -n "${APP_PID:-}" ]; then
    kill "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "========================================" | tee "$REPORT_FILE"
echo " Bun Migration Health Check" | tee -a "$REPORT_FILE"
echo " Runtime: $RUNTIME" | tee -a "$REPORT_FILE"
echo " Time: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$REPORT_FILE"
echo "========================================" | tee -a "$REPORT_FILE"

# --- 1. Start app ---
echo "" | tee -a "$REPORT_FILE"
echo "[1/5] Starting app with $RUNTIME..." | tee -a "$REPORT_FILE"

START_TIME=$(perl -MTime::HiRes -e 'printf("%.3f\n",Time::HiRes::time())')

if [ "$RUNTIME" = "bun" ]; then
  bun --env-file "$ENV_FILE" dist/src/main.js > "$LOG_FILE" 2>&1 &
else
  node --env-file "$ENV_FILE" dist/src/main.js > "$LOG_FILE" 2>&1 &
fi
APP_PID=$!

# Wait for startup (max 30s)
STARTED=false
for i in $(seq 1 300); do
  if grep -q "successfully started" "$LOG_FILE" 2>/dev/null; then
    STARTED=true
    break
  fi
  # Check if process died
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    echo "  FAIL: Process exited prematurely" | tee -a "$REPORT_FILE"
    echo "  Last log lines:" | tee -a "$REPORT_FILE"
    tail -10 "$LOG_FILE" | tee -a "$REPORT_FILE"
    exit 1
  fi
  sleep 0.1
done

END_TIME=$(perl -MTime::HiRes -e 'printf("%.3f\n",Time::HiRes::time())')
STARTUP_DURATION=$(echo "$END_TIME - $START_TIME" | bc)

if [ "$STARTED" = true ]; then
  echo "  OK: Started in ${STARTUP_DURATION}s (PID: $APP_PID)" | tee -a "$REPORT_FILE"
else
  echo "  FAIL: Did not start within 30s" | tee -a "$REPORT_FILE"
  tail -20 "$LOG_FILE" | tee -a "$REPORT_FILE"
  exit 1
fi

# --- 2. HTTP health ---
echo "" | tee -a "$REPORT_FILE"
echo "[2/5] HTTP connectivity..." | tee -a "$REPORT_FILE"

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/" 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "000" ]; then
  echo "  FAIL: Cannot connect to ${BASE_URL}" | tee -a "$REPORT_FILE"
else
  echo "  OK: HTTP ${HTTP_STATUS} from ${BASE_URL}/api/" | tee -a "$REPORT_FILE"
fi

# Try swagger endpoint
SWAGGER_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/swagger-json" 2>/dev/null || echo "000")
echo "  Swagger JSON: HTTP ${SWAGGER_STATUS}" | tee -a "$REPORT_FILE"

# --- 3. Database connectivity (via an API that queries DB) ---
echo "" | tee -a "$REPORT_FILE"
echo "[3/5] Database connectivity..." | tee -a "$REPORT_FILE"

# Try a lightweight API endpoint that hits the database
DB_CHECK=$(curl -s -o /tmp/db-check-response.json -w "%{http_code}" "${BASE_URL}/api/system/dict/type/list?pageNum=1&pageSize=1" 2>/dev/null || echo "000")
if [ "$DB_CHECK" = "200" ]; then
  echo "  OK: Database reachable (dict type list returned HTTP 200)" | tee -a "$REPORT_FILE"
elif [ "$DB_CHECK" = "401" ]; then
  echo "  OK: Database likely reachable (API returned 401 - auth required, app is working)" | tee -a "$REPORT_FILE"
else
  echo "  WARN: dict type list returned HTTP ${DB_CHECK}" | tee -a "$REPORT_FILE"
fi

# --- 4. Redis connectivity (via login attempt or session endpoint) ---
echo "" | tee -a "$REPORT_FILE"
echo "[4/5] Redis connectivity..." | tee -a "$REPORT_FILE"

# Check for Redis errors in logs
REDIS_ERRORS=$(grep -Eic "redis.*(error|fail)|ECONNREFUSED.*6379" "$LOG_FILE" 2>/dev/null || true)
REDIS_ERRORS="${REDIS_ERRORS:-0}"
if [ "$REDIS_ERRORS" -eq 0 ] 2>/dev/null; then
  echo "  OK: No Redis errors in startup logs" | tee -a "$REPORT_FILE"
else
  echo "  WARN: Found $REDIS_ERRORS Redis-related messages in logs" | tee -a "$REPORT_FILE"
  grep -Ei "redis.*(error|fail)|ECONNREFUSED.*6379" "$LOG_FILE" | head -3 | tee -a "$REPORT_FILE"
fi

# --- 5. Memory usage ---
echo "" | tee -a "$REPORT_FILE"
echo "[5/5] Memory usage..." | tee -a "$REPORT_FILE"

if kill -0 "$APP_PID" 2>/dev/null; then
  RSS_KB=$(ps -o rss= -p "$APP_PID" 2>/dev/null || echo "0")
  RSS_MB=$((RSS_KB / 1024))
  echo "  RSS: ${RSS_MB} MB (PID: $APP_PID)" | tee -a "$REPORT_FILE"
else
  echo "  WARN: Process no longer running" | tee -a "$REPORT_FILE"
fi

# --- Summary ---
echo "" | tee -a "$REPORT_FILE"
echo "========================================" | tee -a "$REPORT_FILE"
echo " Summary" | tee -a "$REPORT_FILE"
echo "========================================" | tee -a "$REPORT_FILE"
echo "  Runtime:        $RUNTIME" | tee -a "$REPORT_FILE"
echo "  Startup time:   ${STARTUP_DURATION}s" | tee -a "$REPORT_FILE"
echo "  HTTP status:    ${HTTP_STATUS}" | tee -a "$REPORT_FILE"
echo "  Swagger:        ${SWAGGER_STATUS}" | tee -a "$REPORT_FILE"
echo "  DB check:       ${DB_CHECK}" | tee -a "$REPORT_FILE"
echo "  Redis errors:   ${REDIS_ERRORS}" | tee -a "$REPORT_FILE"
echo "  Memory (RSS):   ${RSS_MB:-?} MB" | tee -a "$REPORT_FILE"
echo "  Full log:       $LOG_FILE" | tee -a "$REPORT_FILE"
echo "  Report:         $REPORT_FILE" | tee -a "$REPORT_FILE"
echo "========================================" | tee -a "$REPORT_FILE"
