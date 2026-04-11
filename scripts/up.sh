#!/usr/bin/env bash
set -e

echo "Bootstrapping Auralyn..."
cp -n .env.example .env 2>/dev/null || true

if ! command -v docker &>/dev/null; then
  echo "Docker not found. Install Docker Desktop and re-run."
  exit 1
fi

if ! command -v docker compose &>/dev/null 2>&1; then
  echo "Docker Compose not found. Upgrade Docker Desktop or install the compose plugin."
  exit 1
fi

docker compose up -d --build

echo ""
echo "Auralyn is running:"
echo "  API:        http://localhost:3000"
echo "  Grafana:    http://localhost:3001  (admin/admin)"
echo "  Prometheus: http://localhost:9090"
echo ""
echo "To stop: docker compose down"
