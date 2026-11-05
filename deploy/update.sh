#!/usr/bin/env bash
set -euo pipefail

cd /opt/kokoklub
git pull --ff-only origin main

docker run --rm \
  -v "$PWD/frontend:/app" \
  -v kokoklub_node_modules:/app/node_modules \
  -w /app node:20-alpine \
  sh -c 'npm ci && npm run build'

docker compose -f docker-compose.prod.yml up -d --build --quiet-build

install -m 644 deploy/kokoklub.nginx /etc/nginx/sites-available/kokoklub
ln -sfn /etc/nginx/sites-available/kokoklub /etc/nginx/sites-enabled/kokoklub
nginx -t
systemctl reload nginx

git rev-parse --short HEAD
