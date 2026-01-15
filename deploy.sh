#!/bin/bash
set -e

echo "==> Checkpointing database..."
sqlite3 data/flowery-branch.db "PRAGMA wal_checkpoint(TRUNCATE);"

echo "==> Pushing to production..."
git push production main

echo "==> Deploy complete!"
