#!/usr/bin/env bash
# Подготовка Codespace: зависимости, .env для демо, база SQLite с тестовыми участниками.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
  secret=$(python -c "import secrets; print(secrets.token_urlsafe(40))")
  sed -i.bak "s|^DJANGO_SECRET_KEY=.*|DJANGO_SECRET_KEY=$secret|" .env && rm -f .env.bak
  cat >> .env <<'ENV'

# Codespaces: без Postgres, адреса вида https://<имя>-5180.app.github.dev
DB_ENGINE=sqlite
CSRF_TRUSTED_ORIGINS=https://*.app.github.dev
ENV
fi

pip install --disable-pip-version-check -q -r backend/requirements.txt
(cd frontend && npm ci --no-audit --no-fund)
(cd backend && python manage.py migrate --noinput && python manage.py demo_members)
