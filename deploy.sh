#!/usr/bin/env bash
# Bring the app up/down via docker compose.
#
# Usage:
#   ./deploy.sh [--dev] [up|down|logs]
#
# --dev also layers docker-compose.dev.yml (bind-mounted source, live
# reload) on top of the base file. Default action is "up".
set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE - copy .env.example to .env and fill it in first (and backend/.env.example to backend/.env)." >&2
  exit 1
fi

DEV=false
ACTION="up"
for arg in "$@"; do
  case "$arg" in
    --dev) DEV=true ;;
    up|down|logs) ACTION="$arg" ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--dev] [up|down|logs]" >&2
      exit 1
      ;;
  esac
done

COMPOSE_FILES=(-f docker-compose.yml)
if [ "$DEV" = true ]; then
  COMPOSE_FILES+=(-f docker-compose.dev.yml)
fi

case "$ACTION" in
  up)
    docker compose "${COMPOSE_FILES[@]}" up -d --build
    ;;
  down)
    docker compose "${COMPOSE_FILES[@]}" down
    ;;
  logs)
    docker compose "${COMPOSE_FILES[@]}" logs -f
    ;;
esac
