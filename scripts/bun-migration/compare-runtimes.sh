#!/usr/bin/env bash
# ============================================================
# Node vs Bun Runtime Comparison Script
# 自动对比两种运行时的启动时间、内存占用、测试速度
# 用法: ./scripts/bun-migration/compare-runtimes.sh [rounds]
# ============================================================
set -euo pipefail

ROUNDS="${1:-3}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

ENV_FILE=".env.dev"
REPORT="/tmp/bun-vs-node-comparison-$(date +%Y%m%d%H%M%S).txt"

echo "============================================" | tee "$REPORT"
echo " Node vs Bun Runtime Comparison" | tee -a "$REPORT"
echo " Rounds: $ROUNDS" | tee -a "$REPORT"
echo " Time: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$REPORT"
echo " Bun: $(bun --version)" | tee -a "$REPORT"
echo " Node: $(node --version)" | tee -a "$REPORT"
echo "============================================" | tee -a "$REPORT"

# Ensure build is up-to-date
echo "" | tee -a "$REPORT"
echo "Building project..." | tee -a "$REPORT"
pnpm build > /dev/null 2>&1
echo "Build complete." | tee -a "$REPORT"

# --- Startup time comparison ---
echo "" | tee -a "$REPORT"
echo "--- Startup Time (${ROUNDS} rounds) ---" | tee -a "$REPORT"

for RUNTIME in bun node; do
  TOTAL=0
  MEMORY_TOTAL=0
  for ROUND in $(seq 1 "$ROUNDS"); do
    LOG="/tmp/compare-${RUNTIME}-${ROUND}.log"
    rm -f "$LOG"

    START=$(perl -MTime::HiRes -e 'printf("%.3f\n",Time::HiRes::time())')
    if [ "$RUNTIME" = "bun" ]; then
      bun --env-file "$ENV_FILE" dist/src/main.js > "$LOG" 2>&1 &
    else
      node --env-file "$ENV_FILE" dist/src/main.js > "$LOG" 2>&1 &
    fi
    PID=$!

    for i in $(seq 1 300); do
      grep -q "successfully started" "$LOG" 2>/dev/null && break
      if ! kill -0 "$PID" 2>/dev/null; then break; fi
      sleep 0.1
    done

    END=$(perl -MTime::HiRes -e 'printf("%.3f\n",Time::HiRes::time())')
    DURATION=$(echo "$END - $START" | bc)

    # Capture memory
    RSS_KB=$(ps -o rss= -p "$PID" 2>/dev/null || echo "0")
    RSS_MB=$((RSS_KB / 1024))

    kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null || true
    rm -f "$LOG"

    echo "  $RUNTIME round $ROUND: ${DURATION}s, ${RSS_MB}MB RSS" | tee -a "$REPORT"
    TOTAL=$(echo "$TOTAL + $DURATION" | bc)
    MEMORY_TOTAL=$((MEMORY_TOTAL + RSS_MB))
    sleep 1
  done
  AVG=$(echo "scale=3; $TOTAL / $ROUNDS" | bc)
  AVG_MEM=$((MEMORY_TOTAL / ROUNDS))
  echo "  $RUNTIME average: ${AVG}s, ${AVG_MEM}MB RSS" | tee -a "$REPORT"
  echo "" | tee -a "$REPORT"

  # Store for summary
  eval "${RUNTIME}_AVG_STARTUP=$AVG"
  eval "${RUNTIME}_AVG_MEM=$AVG_MEM"
done

# --- Test speed comparison ---
echo "--- Test Speed ---" | tee -a "$REPORT"

for RUNTIME in bun node; do
  START=$(perl -MTime::HiRes -e 'printf("%.3f\n",Time::HiRes::time())')
  if [ "$RUNTIME" = "bun" ]; then
    bun jest --runInBand > /tmp/test-${RUNTIME}.log 2>&1 || true
  else
    npx jest --runInBand > /tmp/test-${RUNTIME}.log 2>&1 || true
  fi
  END=$(perl -MTime::HiRes -e 'printf("%.3f\n",Time::HiRes::time())')
  DURATION=$(echo "$END - $START" | bc)

  PASSED=$(grep -oP 'Tests:\s+\d+ failed, \K\d+' /tmp/test-${RUNTIME}.log 2>/dev/null || grep -oP 'Tests:\s+\K\d+' /tmp/test-${RUNTIME}.log 2>/dev/null || echo "?")
  FAILED=$(grep -oP 'Tests:\s+\K\d+(?= failed)' /tmp/test-${RUNTIME}.log 2>/dev/null || echo "0")

  echo "  $RUNTIME tests: ${DURATION}s (${PASSED} passed, ${FAILED} failed)" | tee -a "$REPORT"
  eval "${RUNTIME}_TEST_TIME=$DURATION"
done

# --- Summary ---
echo "" | tee -a "$REPORT"
echo "============================================" | tee -a "$REPORT"
echo " Summary" | tee -a "$REPORT"
echo "============================================" | tee -a "$REPORT"
echo "                    Node        Bun         Delta" | tee -a "$REPORT"
echo "  Startup (avg):    ${node_AVG_STARTUP}s     ${bun_AVG_STARTUP}s" | tee -a "$REPORT"
echo "  Memory (avg):     ${node_AVG_MEM}MB       ${bun_AVG_MEM}MB" | tee -a "$REPORT"
echo "  Test time:        ${node_TEST_TIME}s    ${bun_TEST_TIME}s" | tee -a "$REPORT"
echo "" | tee -a "$REPORT"
echo "  Report saved to: $REPORT" | tee -a "$REPORT"
echo "============================================" | tee -a "$REPORT"
