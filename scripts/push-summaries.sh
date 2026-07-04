#!/bin/bash
# Push locally-generated document summaries to production.
#
# Why this exists: the city's PDF CDN (cms3.revize.com) returns 403 to
# the production IP, so document-family ops (generate-civic-summaries,
# generate-budget-summaries, generate-audit-summaries) can only run on a
# local machine. This script ships the finished summary rows to prod via
# the import-summaries op — no PDFs travel, and the OpenAI spend already
# happened locally.
#
# Workflow:
#   1. npm run dev
#   2. Run the generator op(s) locally, e.g.:
#        curl -X POST http://localhost:3000/api/scrape \
#          -H "Content-Type: application/json" \
#          -H "Authorization: Bearer $ADMIN_SECRET" \
#          -d '{"type":"generate-civic-summaries","params":{"docType":"splost"}}'
#   3. bash scripts/push-summaries.sh <SINCE-DATE>
#
# Args:
#   $1  only push summaries created on/after this date (YYYY-MM-DD).
#       Required, so a backfill push can't accidentally re-send the
#       entire historical summaries table.
#
# Only these entity types are pushed (matching the import op allowlist):
#   splost, notice, strategic, water-quality, budget, audit

set -euo pipefail

LOCAL_DB="${LOCAL_DB:-data/flowery-branch.db}"
PROD_HOST="${PROD_HOST:-root@45.55.236.77}"
PROD_ENV="${PROD_ENV:-/var/www/flowerybranch.charlesthompson.me/.env}"
PROD_API_BASE="${PROD_API_BASE:-http://localhost:3001}"

if [ $# -lt 1 ]; then
  echo "Usage: bash scripts/push-summaries.sh <SINCE-DATE (YYYY-MM-DD)>" >&2
  exit 1
fi
SINCE="$1"

if [ ! -f "$LOCAL_DB" ]; then
  echo "Error: $LOCAL_DB not found. Run this from the repo root." >&2
  exit 1
fi

echo "Reading document summaries from $LOCAL_DB created since $SINCE..."
ROWS_JSON=$(sqlite3 "$LOCAL_DB" -json "
  SELECT entity_type, entity_id, summary_type, content, metadata
  FROM summaries
  WHERE entity_type IN ('splost', 'notice', 'strategic', 'water-quality', 'budget', 'audit')
    AND created_at >= '$SINCE'
  ORDER BY entity_type, entity_id, summary_type")

if [ -z "$ROWS_JSON" ] || [ "$ROWS_JSON" = "[]" ]; then
  echo "No matching summaries found locally. Did the generator ops run?"
  exit 0
fi

COUNT=$(python3 -c "import json,sys; print(len(json.loads(sys.argv[1])))" "$ROWS_JSON")

TMP=$(mktemp /tmp/fb-summaries-payload.XXXXXX.json)
trap 'rm -f "$TMP"' EXIT
python3 -c "
import json, sys
rows = json.loads(sys.argv[1])
print(json.dumps({'type': 'import-summaries', 'params': {'summaries': rows}}))
" "$ROWS_JSON" > "$TMP"

echo "Pushing $COUNT summary row(s) to $PROD_HOST..."
REMOTE_TMP="/tmp/fb-summaries-import-$$.json"
scp -q "$TMP" "$PROD_HOST:$REMOTE_TMP"

RESPONSE=$(ssh "$PROD_HOST" "
  ADMIN_SECRET=\$(grep '^ADMIN_SECRET=' '$PROD_ENV' | cut -d= -f2-)
  curl -sS --max-time 300 -X POST '$PROD_API_BASE/api/scrape' \
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
