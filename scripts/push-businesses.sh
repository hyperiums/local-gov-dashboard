#!/bin/bash
# Push monthly business-listing PDFs to production for AI summarization.
#
# Why this exists: same reason as push-permits.sh — the city's PDF CDN
# (cms3.revize.com) blocks the production IP, and businesses aren't in
# the cron at all. Business data is summaries-only (no rows table), so
# this fetches each month's businesslisting PDF from your local IP and
# ships it to prod, where the import-businesses op runs the OpenAI
# summarization (the API key never leaves the server).
#
# Usage:
#   bash scripts/push-businesses.sh [START_MONTH] [END_MONTH]
# Defaults: START_MONTH = January of the current year, END_MONTH = the
# current month. Months whose PDF the city hasn't published are skipped.
# Re-pushing an existing month regenerates its summary.
#
# Configuration via env vars (defaults are this project's prod setup):
#   PROD_HOST      SSH target  (default: root@45.55.236.77)
#   PROD_ENV       Remote .env (default: /var/www/.../.env)
#   PROD_API_BASE  Prod API base hit from inside the prod host
#                  (default: http://localhost:3001)

set -euo pipefail

START="${1:-$(date +%Y)-01}"
END="${2:-$(date +%Y-%m)}"
PROD_HOST="${PROD_HOST:-root@45.55.236.77}"
PROD_ENV="${PROD_ENV:-/var/www/flowerybranch.charlesthompson.me/.env}"
PROD_API_BASE="${PROD_API_BASE:-http://localhost:3001}"
BASE_URL="https://www.flowerybranchga.org"

# Month-name candidates matching src/lib/scraper/utils.ts ALT_MONTH_NAMES
name_candidates() {
  case "$1" in
    01) echo "Jan January" ;;
    02) echo "Feb February" ;;
    03) echo "Mar March" ;;
    04) echo "Apr April" ;;
    05) echo "May" ;;
    06) echo "June Jun" ;;
    07) echo "July Jul" ;;
    08) echo "Aug August" ;;
    09) echo "Sept Sep September" ;;
    10) echo "Oct October" ;;
    11) echo "Nov November" ;;
    12) echo "Dec December" ;;
  esac
}

PDF_TMP=$(mktemp -d /tmp/fb-business-pdfs.XXXXXX)
TMP=$(mktemp /tmp/fb-businesses-payload.XXXXXX.json)
trap 'rm -rf "$PDF_TMP" "$TMP"' EXIT

PDFS_JSON_ENTRIES=""
FOUND=0
M="$START"
while [ "$(printf '%s\n%s' "$M" "$END" | sort | head -1)" = "$M" ]; do
  YEAR="${M%-*}"
  MM="${M#*-}"
  OUT="$PDF_TMP/$M.pdf"
  GOT=""
  for NAME in $(name_candidates "$MM"); do
    URL="$BASE_URL/${NAME}${YEAR}businesslisting.pdf"
    CODE=$(curl -sS -o "$OUT" -w "%{http_code}" -L --max-time 20 \
      -A "FloweryBranchCivicDashboard/1.0 (civic transparency project)" \
      "$URL" || echo "ERR")
    if [ "$CODE" = "200" ] && [ -s "$OUT" ]; then
      GOT="$URL"
      break
    fi
    rm -f "$OUT"
  done

  if [ -n "$GOT" ]; then
    SIZE=$(wc -c < "$OUT" | tr -d ' ')
    echo "  $M: ${SIZE}B from $GOT"
    B64=$(base64 < "$OUT" | tr -d '\n')
    ENTRY=$(python3 -c "import json,sys; print(json.dumps({sys.argv[1]: sys.argv[2]})[1:-1])" "$M" "$B64")
    if [ -z "$PDFS_JSON_ENTRIES" ]; then
      PDFS_JSON_ENTRIES="$ENTRY"
    else
      PDFS_JSON_ENTRIES="$PDFS_JSON_ENTRIES,$ENTRY"
    fi
    FOUND=$((FOUND + 1))
  else
    echo "  $M: no businesslisting PDF published; skipping"
  fi

  # Next month
  if [ "$MM" = "12" ]; then
    M="$((YEAR + 1))-01"
  else
    M=$(printf '%s-%02d' "$YEAR" "$((10#$MM + 1))")
  fi
done

if [ "$FOUND" -eq 0 ]; then
  echo "No business PDFs found between $START and $END. Nothing to push."
  exit 0
fi

printf '{"type":"import-businesses","params":{"pdfsByMonth":{%s}}}' "$PDFS_JSON_ENTRIES" > "$TMP"

echo "Pushing $FOUND business PDF(s) to $PROD_HOST..."
REMOTE_TMP="/tmp/fb-businesses-import-$$.json"
scp -q "$TMP" "$PROD_HOST:$REMOTE_TMP"

RESPONSE=$(ssh "$PROD_HOST" "
  ADMIN_SECRET=\$(grep '^ADMIN_SECRET=' '$PROD_ENV' | cut -d= -f2-)
  curl -sS --max-time 1200 -X POST '$PROD_API_BASE/api/scrape' \
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
