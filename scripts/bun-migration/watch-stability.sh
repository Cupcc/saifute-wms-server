#!/usr/bin/env bash
# ============================================================
# Bun Stability Watcher - 长时间运行观察脚本
# 后台启动 Bun 应用，每隔 interval 秒进行一次健康检查
# 异常时记录日志，可选通知
#
# 用法:
#   ./scripts/bun-migration/watch-stability.sh            # 默认每 60s 检查一次
#   ./scripts/bun-migration/watch-stability.sh 30          # 每 30s 检查一次
#   ./scripts/bun-migration/watch-stability.sh 60 3600     # 每 60s 检查，运行 1 小时
#
# 输出:
#   /tmp/bun-stability-watch-YYYYMMDD.log   — 详细日志
#   /tmp/bun-stability-summary-YYYYMMDD.txt — 运行结束时的摘要
# ============================================================
set -euo pipefail

INTERVAL="${1:-60}"
MAX_DURATION="${2:-0}"  # 0 = run until interrupted
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

ENV_FILE=".env.dev"
DATE_TAG=$(date +%Y%m%d%H%M%S)
LOG_FILE="/tmp/bun-stability-watch-${DATE_TAG}.log"
APP_LOG="/tmp/bun-stability-app-${DATE_TAG}.log"
SUMMARY="/tmp/bun-stability-summary-${DATE_TAG}.txt"

PORT=$(grep -E "^PORT=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "3000")
PORT="${PORT:-3000}"
BASE_URL="http://localhost:${PORT}"

CHECK_COUNT=0
FAIL_COUNT=0
RESTART_COUNT=0
START_EPOCH=$(date +%s)
APP_PID=""

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

start_app() {
  log "Starting bun app..."
  bun --env-file "$ENV_FILE" dist/src/main.js >> "$APP_LOG" 2>&1 &
  APP_PID=$!
  log "App started (PID: $APP_PID)"

  # Wait for startup
  for i in $(seq 1 300); do
    grep -q "successfully started" "$APP_LOG" 2>/dev/null && break
    if ! kill -0 "$APP_PID" 2>/dev/null; then
      log "FATAL: App process exited during startup"
      return 1
    fi
    sleep 0.1
  done

  if grep -q "successfully started" "$APP_LOG" 2>/dev/null; then
    log "App ready"
    return 0
  else
    log "FATAL: App did not start within 30s"
    return 1
  fi
}

do_health_check() {
  CHECK_COUNT=$((CHECK_COUNT + 1))
  local status="OK"
  local details=""

  # Check process alive
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    status="FAIL"
    details="Process $APP_PID not running"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    log "CHECK #$CHECK_COUNT: $status — $details"

    # Auto-restart
    log "Attempting restart..."
    RESTART_COUNT=$((RESTART_COUNT + 1))
    start_app || { log "Restart failed"; return 1; }
    return 0
  fi

  # HTTP check
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${BASE_URL}/api/" 2>/dev/null || echo "000")
  if [ "$http_code" = "000" ]; then
    status="FAIL"
    details="HTTP unreachable"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi

  # Memory check
  local rss_kb
  rss_kb=$(ps -o rss= -p "$APP_PID" 2>/dev/null || echo "0")
  local rss_mb=$((rss_kb / 1024))

  # Memory leak warning (>512MB)
  if [ "$rss_mb" -gt 512 ]; then
    details="${details:+$details; }Memory high: ${rss_mb}MB"
    if [ "$status" = "OK" ]; then status="WARN"; fi
  fi

  # App log errors since last check
  local recent_errors
  recent_errors=$(tail -100 "$APP_LOG" 2>/dev/null | grep -ci "error\|exception\|fatal" || echo "0")

  log "CHECK #$CHECK_COUNT: $status — HTTP:$http_code RSS:${rss_mb}MB Errors:$recent_errors ${details:+($details)}"
}

cleanup() {
  log "Shutting down watcher..."
  if [ -n "$APP_PID" ] && kill -0 "$APP_PID" 2>/dev/null; then
    kill "$APP_PID" 2>/dev/null
    wait "$APP_PID" 2>/dev/null || true
  fi

  ELAPSED=$(( $(date +%s) - START_EPOCH ))
  HOURS=$((ELAPSED / 3600))
  MINUTES=$(( (ELAPSED % 3600) / 60 ))

  {
    echo "========================================"
    echo " Bun Stability Watch Summary"
    echo "========================================"
    echo "  Duration:       ${HOURS}h ${MINUTES}m"
    echo "  Health checks:  $CHECK_COUNT"
    echo "  Failures:       $FAIL_COUNT"
    echo "  Auto-restarts:  $RESTART_COUNT"
    echo "  Uptime ratio:   $(( (CHECK_COUNT - FAIL_COUNT) * 100 / (CHECK_COUNT > 0 ? CHECK_COUNT : 1) ))%"
    echo "  Detail log:     $LOG_FILE"
    echo "  App log:        $APP_LOG"
    echo "========================================"
  } | tee "$SUMMARY" | tee -a "$LOG_FILE"

  exit 0
}
trap cleanup EXIT INT TERM

# --- Main ---
log "=== Bun Stability Watcher ==="
log "Interval: ${INTERVAL}s, Max duration: ${MAX_DURATION}s (0=unlimited)"
log "Log: $LOG_FILE"

# Build first
log "Building project..."
pnpm build > /dev/null 2>&1
log "Build done."

# Start app
start_app || exit 1

# Watch loop
while true; do
  sleep "$INTERVAL"
  do_health_check

  # Check max duration
  if [ "$MAX_DURATION" -gt 0 ]; then
    ELAPSED=$(( $(date +%s) - START_EPOCH ))
    if [ "$ELAPSED" -ge "$MAX_DURATION" ]; then
      log "Max duration reached (${MAX_DURATION}s)"
      break
    fi
  fi
done
