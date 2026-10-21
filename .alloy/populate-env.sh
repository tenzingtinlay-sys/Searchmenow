#!/usr/bin/env bash
# Idempotently create .env from .env.example, filling values from the process env.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || cp .env.example .env
for key in HIBP_API_KEY; do
  val="${!key:-}"
  if [ -n "$val" ] && grep -qE "^${key}=$" .env; then sed -i "s|^${key}=$|${key}=${val}|" .env; fi
done
