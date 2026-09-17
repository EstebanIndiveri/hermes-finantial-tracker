#!/usr/bin/env bash
#
# Idempotent development bootstrap for Cloud Agent / local environments.
#
# Hermes uses Turso (libSQL) in production. The Next.js middleware runs in the
# Edge runtime, whose libSQL client only speaks http(s)/libsql (not file:), so
# local development runs a local libSQL HTTP server (`turso dev`) instead of a
# hosted Turso database. This script prepares everything that server + the app
# need, without requiring any Turso/Telegram/Groq credentials.
#
# Safe to re-run: dependency install, schema push and seeds are all idempotent.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Installing npm dependencies"
npm ci

echo "==> Ensuring local dev env file (.env.local)"
if [ ! -f .env.local ]; then
  cat > .env.local <<'EOF'
# Local development configuration (auto-loaded by Next.js). Not committed.
# Points at the local libSQL server started by `turso dev` (see terminals).
TURSO_DATABASE_URL=http://127.0.0.1:8080
TURSO_AUTH_TOKEN=
TELEGRAM_BOT_TOKEN=
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=HermesFinanceAssistBot
TELEGRAM_ALLOWED_USER_ID=
TELEGRAM_SECRET_TOKEN=dev-telegram-secret
TELEGRAM_CHAT_ID=
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b
CRON_SECRET=dev-cron-secret
WEB_ACCESS_TOKEN=dev-web-access-token
SESSION_SECRET=dev-session-secret-change-me
OCR_SPACE_API_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
EOF
  echo "    created .env.local"
else
  echo "    .env.local already present, leaving it untouched"
fi

echo "==> Ensuring Turso CLI (local libSQL server)"
if ! command -v turso >/dev/null 2>&1 && [ ! -x "$HOME/.turso/turso" ]; then
  curl -sSfL https://get.tur.so/install.sh | bash
else
  echo "    turso already installed"
fi

# Schema + demo data are written directly to the local.db file via a file: URL
# (the Node runtime libSQL client supports file:). `turso dev` then serves this
# same local.db over HTTP for the app at runtime.
echo "==> Applying database schema"
TURSO_DATABASE_URL="file:local.db" TURSO_AUTH_TOKEN="local-dev-unused" npx drizzle-kit push

echo "==> Seeding demo data (login: demo / demo12345)"
TURSO_DATABASE_URL="file:local.db" TURSO_AUTH_TOKEN="local-dev-unused" npx tsx scripts/dev-seed.ts

echo "==> Setup complete"
