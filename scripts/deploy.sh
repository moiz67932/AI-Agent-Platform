#!/usr/bin/env bash
# deploy.sh — Pull latest code, rebuild containers, and restart.
# Usage: ./scripts/deploy.sh
# Run from the repo root (/opt/voiceai or wherever you cloned).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Pulling latest changes from origin/main..."
git pull origin main

echo "==> Building Docker images..."
docker compose build

echo "==> Starting containers..."
docker compose up -d

echo "==> Pruning old images..."
docker image prune -f

echo "==> Current status:"
docker compose ps

echo ""
echo "Deploy complete. Verify with:"
echo "  curl http://localhost/health"
