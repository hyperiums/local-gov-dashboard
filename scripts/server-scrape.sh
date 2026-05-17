#!/bin/bash
# Flowery Branch civic dashboard - automated scrape pipeline.
#
# Runs via cron on the production host (root@45.55.236.77).
# Curls localhost:3001 directly to bypass nginx and avoid proxy timeouts.
#
# Source of truth: this file. The post-receive hook copies it to
# /usr/local/bin/flowerybranch-scrape.sh on every deploy so the cron and
# the repo never drift.
#
# Alerting: if RESEND_API_KEY, ALERT_FROM_EMAIL, and ALERT_TO_EMAIL are
# all set in the production .env, the script emails a failure digest on
# any non-success response. No email is sent on a clean run.

LOG="/var/log/flowerybranch-scrape.log"
ENV_FILE="/var/www/flowerybranch.charlesthompson.me/.env"

read_env() {
  grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-
}

ADMIN_SECRET=$(read_env ADMIN_SECRET)
RESEND_API_KEY=$(read_env RESEND_API_KEY)
ALERT_FROM_EMAIL=$(read_env ALERT_FROM_EMAIL)
ALERT_TO_EMAIL=$(read_env ALERT_TO_EMAIL)

RUN_START=$(date '+%Y-%m-%d %H:%M:%S %Z')
FAILURES=""

log() {
  echo "$*" >> "$LOG"
}

run_op() {
  local label=$1
  local payload=$2

  log ""
  log "$(date): $label"

  local response
  response=$(curl -sS --max-time 1400 -X POST http://localhost:3001/api/scrape \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_SECRET" \
    -d "$payload" 2>&1)
  local curl_exit=$?

  log "$response"

  if [ $curl_exit -ne 0 ]; then
    local msg="$label: curl exit $curl_exit"
    log "ERROR: $msg"
    FAILURES="$FAILURES
- $msg
  $(echo "$response" | head -c 500)"
    return
  fi

  if ! echo "$response" | grep -q '"success":true'; then
    local msg="$label: response did not include success:true"
    log "ERROR: $msg"
    FAILURES="$FAILURES
- $msg
  $(echo "$response" | head -c 500)"
  fi
}

send_alert() {
  local body=$1
  [ -z "$RESEND_API_KEY" ] && return
  [ -z "$ALERT_FROM_EMAIL" ] && return
  [ -z "$ALERT_TO_EMAIL" ] && return

  local payload
  payload=$(ALERT_FROM_EMAIL="$ALERT_FROM_EMAIL" ALERT_TO_EMAIL="$ALERT_TO_EMAIL" \
    python3 -c '
import json, os, sys
print(json.dumps({
    "from": os.environ["ALERT_FROM_EMAIL"],
    "to": [os.environ["ALERT_TO_EMAIL"]],
    "subject": "Flowery Branch scrape failure",
    "text": sys.stdin.read(),
}))
' <<< "$body")

  log ""
  log "$(date): Sending failure alert to $ALERT_TO_EMAIL via Resend"
  curl -sS -X POST https://api.resend.com/emails \
    -H "Authorization: Bearer $RESEND_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$payload" >> "$LOG" 2>&1
  log ""
}

THIS_YEAR=$(date +%Y)
LAST_YEAR=$((THIS_YEAR - 1))

log "===== $RUN_START: Starting scrape ====="

# Meetings, agendas, summaries, resolutions, vote outcomes.
run_op "bulk-meetings-with-agenda" \
  '{"type":"bulk-meetings-with-agenda","params":{"minYear":2025}}'

# Pull Municode ordinances (no per-call summarization — the next op does
# that incrementally so we don't re-summarize every existing ordinance).
run_op "ordinances (Municode)" \
  '{"type":"ordinances","params":{"generateSummaries":false}}'

# Summarize up to 10 ordinances that don't have a summary yet, so we
# catch up gradually after Municode publishes new ones.
run_op "generate-ordinance-summaries" \
  '{"type":"generate-ordinance-summaries","params":{"limit":10}}'

# Link freshly-pulled ordinances to their meetings.
run_op "link-ordinances" '{"type":"link-ordinances"}'

# Monthly permit reports for this year and last (covers slow republishing).
run_op "bulk-permits" \
  "$(printf '{"type":"bulk-permits","params":{"years":["%s","%s"]}}' "$LAST_YEAR" "$THIS_YEAR")"

if [ -n "$FAILURES" ]; then
  log ""
  log "===== $(date): Scrape complete WITH FAILURES ====="
  send_alert "Flowery Branch scrape on $(hostname) had failures starting at $RUN_START:
$FAILURES

Full log: /var/log/flowerybranch-scrape.log"
  exit 1
fi

log ""
log "===== $(date): Scrape complete (no errors) ====="
exit 0
