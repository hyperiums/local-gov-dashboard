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
# Optional args:
#   $1  minimum month to push (default 2025-01)
#   $2  minimum month to attach PDFs for (default: same as $1). PDFs
#       trigger AI summary regeneration on prod, so when backfilling
#       corrected rows for months whose summaries already exist, set
#       this to the first month that actually needs a new summary.
# Example:
#   bash scripts/push-permits.sh 2024-01 2026-05
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
PDF_SINCE="${2:-$SINCE}"
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

# Unique month → source_url pairs needing summary PDFs — we'll fetch a
# PDF for each so prod can regenerate the AI summary. The scraper already
# found the working URL for every month (the city's file naming varies:
# June2025 vs Jun2026), so reuse it instead of guessing names.
MONTHS=$(sqlite3 "$LOCAL_DB" \
  "SELECT month || ' ' || source_url FROM permits WHERE month >= '$PDF_SINCE' GROUP BY month ORDER BY month")

# grep -c exits 1 on zero matches (a legitimate case when PDF_SINCE is
# in the future for a rows-only push), which set -e would treat as fatal
MONTH_COUNT=$(printf '%s\n' "$MONTHS" | grep -c . || true)
if [ "$MONTH_COUNT" -gt 24 ]; then
  echo "Too many summary PDFs ($MONTH_COUNT > 24) in one push. Tighten the PDF_SINCE arg." >&2
  exit 1
fi

# Fetch each month's PDF from your local (unblocked) IP.
PDF_TMP=$(mktemp -d /tmp/fb-permit-pdfs.XXXXXX)
TMP=$(mktemp /tmp/fb-permits-payload.XXXXXX.json)
ROWS_TMP=$(mktemp /tmp/fb-permits-rows.XXXXXX.json)
trap 'rm -rf "$PDF_TMP" "$TMP" "$ROWS_TMP"' EXIT
echo "Fetching $MONTH_COUNT permit PDF(s) from your local IP..."
while read -r M URL; do
  [ -z "$M" ] && continue
  OUT="$PDF_TMP/$M.pdf"
  CODE=$(curl -sS -o "$OUT" -w "%{http_code}" -L --max-time 20 \
    -A "FloweryBranchCivicDashboard/1.0 (civic transparency project)" \
    "$URL" || echo "ERR")
  if [ "$CODE" != "200" ] || [ ! -s "$OUT" ]; then
    echo "  $M: PDF unavailable ($URL → $CODE); skipping summary"
    rm -f "$OUT"
    continue
  fi
  echo "  $M: $(wc -c < "$OUT" | tr -d ' ')B from $URL"
done <<< "$MONTHS"

# Rows and base64 PDFs travel through files, never argv: a full-history push
# is several megabytes and ARG_MAX rejects it ("Argument list too long"),
# which reads like a broken script rather than a size limit.
printf '%s' "$ROWS_JSON" > "$ROWS_TMP"

COUNT=$(python3 - "$ROWS_TMP" "$PDF_TMP" "$TMP" <<'PY'
import base64, json, pathlib, sys

rows_path, pdf_dir, out_path = (pathlib.Path(p) for p in sys.argv[1:4])
rows = json.loads(rows_path.read_text())
pdfs = {
    pdf.stem: base64.b64encode(pdf.read_bytes()).decode()
    for pdf in sorted(pdf_dir.glob('*.pdf'))
}
out_path.write_text(json.dumps({
    'type': 'import-permits',
    'params': {'permits': rows, 'pdfsByMonth': pdfs},
}))
print(len(rows))
PY
)
echo "Pushing $COUNT permit row(s) + $MONTH_COUNT PDF(s) to $PROD_HOST..."

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
