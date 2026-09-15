#!/usr/bin/env bash
# VuelaClaim — CI local sin cuota: tests + soak + recibo hash-verificado
# Uso: bash scripts/ci.sh [--soak]
set -euo pipefail
cd "$(dirname "$0")/.."

SOAK=0
[ "${1:-}" = "--soak" ] && SOAK=1

SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'no-git')"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
OUT="$(mktemp)"
echo "== VuelaClaim CI @ $SHA ($STAMP) =="

set +e
npm test 2>&1 | tee "$OUT"
TEST_RC=${PIPESTATUS[0]}
set -e

SOAK_LINE=""
if [ "$SOAK" = "1" ]; then
  SOAK_LINE="$(node deploy/soak.mjs http://127.0.0.1:8787 4 5 2>&1 | tail -1 || true)"
fi

PASS="$(grep -E '^# pass ' "$OUT" | awk '{print $3}' || true)"
FAIL="$(grep -E '^# fail ' "$OUT" | awk '{print $3}' || true)"
[ -z "$PASS" ] && PASS="$(grep -cE '^✔' "$OUT" || echo 0)"
[ -z "$FAIL" ] && FAIL="0"
HASH="$(sha256sum "$OUT" | awk '{print $1}')"

mkdir -p data/receipts
RECEIPT="data/receipts/CI-${SHA}-$(date -u +%Y%m%dT%H%M%SZ).json"
cat > "$RECEIPT" <<EOF
{
  "app": "VuelaClaim",
  "commit": "$SHA",
  "timestamp": "$STAMP",
  "passed": ${PASS:-0},
  "failed": ${FAIL:-0},
  "exitCode": $TEST_RC,
  "soak": "$SOAK_LINE",
  "outputSha256": "$HASH"
}
EOF

echo "Recibo: $RECEIPT"
[ "$TEST_RC" -eq 0 ] && echo "CI OK ✅" || { echo "CI FALLÓ ❌"; exit "$TEST_RC"; }
