#!/usr/bin/env bash
# Запуск портала в фоне. Логи — в .logs/ (там же коды входа из SMS: tail -f .logs/backend.log).
set -euo pipefail
cd "$(dirname "$0")/.."
BACKEND_PORT=${BACKEND_PORT:-8001}
FRONTEND_PORT=${FRONTEND_PORT:-5180}
mkdir -p .logs

(cd backend && nohup python manage.py runserver "0.0.0.0:$BACKEND_PORT" > ../.logs/backend.log 2>&1 &)
(cd frontend && VITE_API_PROXY="http://localhost:$BACKEND_PORT" \
  nohup npx vite --host --port "$FRONTEND_PORT" --strictPort > ../.logs/frontend.log 2>&1 &)

# чтобы ссылкой можно было поделиться без входа в GitHub; если токену не хватает прав —
# открыть порт вручную: вкладка Ports → 5180 → Port Visibility → Public
if [ -n "${CODESPACE_NAME:-}" ]; then
  gh codespace ports visibility "$FRONTEND_PORT:public" -c "$CODESPACE_NAME" >/dev/null 2>&1 || true
fi

echo "Портал запускается на порту $FRONTEND_PORT, логи в .logs/"
