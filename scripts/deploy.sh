#!/bin/bash
set -e

VPS="celox"
APP_DIR="/root/apps/claude-token-tracker"

echo "Deploying Claude Token Tracker to tracker.celox.io..."

# Sync files (exclude node_modules, data, .env, .git)
rsync -avz --delete \
  --exclude node_modules \
  --exclude data \
  --exclude .env \
  --exclude .git \
  --exclude sync-agent/node_modules \
  --exclude sync-agent/config.json \
  --exclude sync-agent/.sync-state.json \
  ./ "$VPS:$APP_DIR/"

# Install dependencies and restart
ssh "$VPS" \
  "cd $APP_DIR && npm ci --production && pm2 restart token-tracker || pm2 start server.js --name token-tracker"

echo "Deploy complete!"
echo "Visit: https://tracker.celox.io"
