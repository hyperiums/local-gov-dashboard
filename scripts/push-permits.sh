#!/bin/bash
# Push locally-scraped permit records to production.
#
# Why this exists: production's IP is blocked by the city's PDF-hosting
# CDN (cms3.revize.com), so the production cron's bulk-permits step
# always returns 0 PDFs. Refreshing permits requires fetching from an
# unblocked IP (your laptop) and pushing the rows up.
#
# Workflow:
#   1. Start the local dev server:                 npm run dev
#   2. Refresh permits in your local DB:
#        curl -X POST http://localhost:3000/api/scrape \
#          -H "Content-Type: application/json" \
#          -H "Authorization: Bearer $ADMIN_SECRET" \
#          -d '{"type":"bulk-permits","params":{"years":["2025","2026"]}}'
#   3. Push the rows to prod:                      bash scripts/push-permits.sh
#
# Optional arg: minimum month to push (default 2025-01). Example:
#   bash scripts/push-permits.sh 2026-01
#
# Configuration via env vars (defaults are this project's prod setup;
# override for forks or staging):
#   PROD_HOST      SSH target  (default: root@45.55.236.77)
#   PROD_ENV       Remote .env (default: /var/www/.../.env)
#   PROD_API_BASE  Prod API base hit from inside the prod host
#                  (default: http://localhost:3001)
#
# Requires: sqlite3, python3, ssh access to the prod host. The remote
# ADMIN_SECRET is read from $PROD_ENV on the server — it's never written
# to your local environment or shell history.

set -euo pipefail

LOCAL_DB="${LOCAL_DB:-data/flowery-branch.db}"
SINCE="${1:-2025-01}"
PROD_HOST="${PROD_HOST:-root@45.55.236.77}"
PROD_ENV="${PROD_ENV:-/var/www/flowerybranch.charlesthompson.me/.env}"
PROD_API_BASE="${PROD_API_BASE:-http://localhost:3001}"

if [ ! -f "$LOCAL_DB" ]; then
  echo "Error: $LOCAL_DB not found. Run this from the repo root." >&2
  exit 1
fi

echo "Reading permits from $LOCAL_DB where month >= $SINCE..."
ROWS_JSON=$(sqlite3 "$LOCAL_DB" -json \
  "SELECT id, month, type, address, description, value, source_url FROM permits WHERE month >= '$SINCE' ORDER BY month, id")

if [ -z "$ROWS_JSON" ] || [ "$ROWS_JSON" = "[]" ]; then
  echo "No permits found locally with month >= $SINCE. Did you run bulk-permits first?"
  exit 0
fi

# Unique months in the payload — we'll fetch a PDF for each so prod can
# regenerate the AI summary. Cap to avoid pathological payload sizes.
MONTHS=$(python3 -c "
import json, sys
rows = json.loads(sys.argv[1])
seen = []
for r in rows:
    m = r.get('month')
    if m and m not in seen:
        seen.append(m)
print('\n'.join(sorted(seen)))
" "$ROWS_JSON")

MONTH_COUNT=$(printf '%s\n' "$MONTHS" | grep -c .)
if [ "$MONTH_COUNT" -gt 24 ]; then
  echo "Too many months ($MONTH_COUNT > 24) in one push. Tighten the SINCE arg." >&2
  exit 1
fi

# Fetch each month's PDF from your local (unblocked) IP and base64 it.
# Map YYYY-MM to the month-name shape the city uses: 01->Jan, 09->Sept, etc.
declare -A MNAMES=(
  [01]=Jan [02]=Feb [03]=Mar [04]=Apr [05]=May [06]=June
  [07]=July [08]=Aug [09]=Sept [10]=Oct [11]=Nov [12]=Dec
)
PDF_TMP=$(mktemp -d /tmp/fb-permit-pdfs.XXXXXX)
trap 'rm -rf "$PDF_TMP" "${TMP:-}"' EXIT
PDFS_JSON_ENTRIES=""
echo "Fetching $MONTH_COUNT permit PDF(s) from your local IP..."
for M in $MONTHS; do
  YEAR="${M%-*}"
  MM="${M#*-}"
  MNAME="${MNAMES[$MM]:-}"
  if [ -z "$MNAME" ]; then
    echo "  skip $M (no month-name mapping)"
    continue
  fi
  URL="https://www.flowerybranchga.org/${MNAME}${YEAR}permitlisting.pdf"
  OUT="$PDF_TMP/$M.pdf"
  CODE=$(curl -sS -o "$OUT" -w "%{http_code}" -L --max-time 20 \
    -A "FloweryBranchCivicDashboard/1.0 (civic transparency project)" \
    "$URL" || echo "ERR")
  if [ "$CODE" != "200" ] || [ ! -s "$OUT" ]; then
    echo "  $M: PDF unavailable ($URL → $CODE); skipping summary"
    rm -f "$OUT"
    continue
  fi
  SIZE=$(wc -c < "$OUT" | tr -d ' ')
  echo "  $M: ${SIZE}B from $URL"
  B64=$(base64 < "$OUT" | tr -d '\n')
  ENTRY=$(python3 -c "import json,sys; print(json.dumps({sys.argv[1]: sys.argv[2]})[1:-1])" "$M" "$B64")
  if [ -z "$PDFS_JSON_ENTRIES" ]; then
    PDFS_JSON_ENTRIES="$ENTRY"
  else
    PDFS_JSON_ENTRIES="$PDFS_JSON_ENTRIES,$ENTRY"
  fi
done

PAYLOAD=$(python3 -c "
import json, sys
rows = json.loads(sys.argv[1])
pdfs = json.loads('{' + sys.argv[2] + '}') if sys.argv[2] else {}
print(json.dumps({'type': 'import-permits', 'params': {'permits': rows, 'pdfsByMonth': pdfs}}))
" "$ROWS_JSON" "$PDFS_JSON_ENTRIES")

COUNT=$(python3 -c "
import json, sys
print(len(json.loads(sys.argv[1])))
" "$ROWS_JSON")
echo "Pushing $COUNT permit row(s) + $MONTH_COUNT PDF(s) to $PROD_HOST..."

TMP=$(mktemp /tmp/fb-permits-payload.XXXXXX.json)
trap 'rm -f "$TMP"' EXIT
printf '%s' "$PAYLOAD" > "$TMP"

REMOTE_TMP="/tmp/fb-permits-import-$$.json"
scp -q "$TMP" "$PROD_HOST:$REMOTE_TMP"

RESPONSE=$(ssh "$PROD_HOST" "
  ADMIN_SECRET=\$(grep '^ADMIN_SECRET=' '$PROD_ENV' | cut -d= -f2-)
  curl -sS -X POST '$PROD_API_BASE/api/scrape' \
    -H 'Content-Type: application/json' \
    -H \"Authorization: Bearer \$ADMIN_SECRET\" \
    -d @'$REMOTE_TMP'
  rm -f '$REMOTE_TMP'
")

echo "$RESPONSE"

if ! echo "$RESPONSE" | grep -q '"success":true'; then
  echo "Push reported failure. See response above." >&2
  exit 1
fi
echo "Done."
