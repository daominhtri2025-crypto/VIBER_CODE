#!/usr/bin/env bash
# End-to-end run on a FRESH demo database: API (mock AI) on :8000, Next.js on :3000, Playwright.
# Usage: scripts/e2e.sh            (requires: pip install -r api/requirements-dev.txt; cd web && npm ci && npm run build)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
cleanup() { [[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null || true; [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null || true; }
trap cleanup EXIT

if curl -s -o /dev/null http://127.0.0.1:8000/health || curl -s -o /dev/null http://127.0.0.1:3000; then
  echo "Ports 8000/3000 already in use; stop the other servers first." >&2; exit 1
fi
(cd "$ROOT/api" && python3 -m scripts.seed_demo --db "$WORK/demo.db" --password "Demo-2026!" --ai-provider mock)
(cd "$ROOT/api" && APP_DB_PATH="$WORK/demo.db" JWT_SECRET="e2e-secret-e2e-secret-e2e-secret-1234" AI_ENABLED=true AI_PROVIDER=mock \
   exec python3 -m uvicorn app.api.main:app --host 127.0.0.1 --port 8000 > "$WORK/api.log" 2>&1) & API_PID=$!
(cd "$ROOT/web" && API_INTERNAL_URL=http://127.0.0.1:8000 exec node node_modules/next/dist/bin/next start -p 3000 > "$WORK/web.log" 2>&1) & WEB_PID=$!
for i in $(seq 1 60); do curl -sf http://127.0.0.1:8000/health >/dev/null && curl -s -o /dev/null http://127.0.0.1:3000/login && break; sleep 1; done
cd "$ROOT/web" && npx playwright test "$@"
