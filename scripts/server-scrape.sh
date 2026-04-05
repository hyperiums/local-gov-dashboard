#!/bin/bash
# Automated scrape - runs via cron on the production host
# Curls localhost:3001 directly (bypasses nginx, avoids proxy timeouts)
LOG="/var/log/flowerybranch-scrape.log"
ADMIN_SECRET=$(grep ADMIN_SECRET /var/www/flowerybranch.charlesthompson.me/.env | cut -d= -f2)

echo "$(date): Starting scrape..." >> "$LOG"

curl -s -X POST http://localhost:3001/api/scrape \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -d '{"type":"bulk-meetings-with-agenda","params":{"minYear":2025}}' \
  >> "$LOG" 2>&1

echo "" >> "$LOG"

curl -s -X POST http://localhost:3001/api/scrape \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -d '{"type":"link-ordinances"}' \
  >> "$LOG" 2>&1

echo -e "\n$(date): Scrape complete.\n---" >> "$LOG"
