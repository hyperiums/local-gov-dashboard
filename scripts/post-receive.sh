#!/bin/bash
# Post-receive hook installed on the production server at
# /var/www/flowerybranch.charlesthompson.me.git/hooks/post-receive
#
# This file is kept in the repo for visibility. The hook itself is NOT
# automatically synced — install or update it manually on the server.
# Compare against the live copy:
#   ssh root@45.55.236.77 'cat /var/www/flowerybranch.charlesthompson.me.git/hooks/post-receive'
#
# Note: the hook backs up data/flowery-branch.db before checkout and
# restores it after. That means local `data:` commits never reach
# production — the prod DB is preserved and only updated by the cron and
# manual admin scrapes.
set -e

TARGET="/var/www/flowerybranch.charlesthompson.me"
GIT_DIR="/var/www/flowerybranch.charlesthompson.me.git"

echo "==> Backing up database..."
cp -p $TARGET/data/flowery-branch.db /tmp/fb-db-deploy-backup

echo "==> Checking out to $TARGET..."
git --work-tree=$TARGET --git-dir=$GIT_DIR checkout -f main

echo "==> Restoring database..."
cp -p /tmp/fb-db-deploy-backup $TARGET/data/flowery-branch.db

echo "==> Syncing cron script to /usr/local/bin..."
cp -p $TARGET/scripts/server-scrape.sh /usr/local/bin/flowerybranch-scrape.sh
chmod +x /usr/local/bin/flowerybranch-scrape.sh

echo "==> Cleaning up Docker..."
docker system prune -f

echo "==> Rebuilding Docker..."
cd $TARGET
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build

echo "==> Waiting for health check..."
sleep 10
docker-compose -f docker-compose.prod.yml ps

echo "==> Deploy complete!"
