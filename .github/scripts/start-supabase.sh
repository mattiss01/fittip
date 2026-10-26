#!/usr/bin/env bash
# Starts the local Supabase stack, retrying when an image registry turns a
# download away. The CLI pulls every image at once and gives up after three
# quick retries; a registry under load ("toomanyrequests") needs longer. Each
# attempt keeps the images it already pulled, so the next one asks for fewer.
set -uo pipefail

for attempt in 1 2 3 4; do
  if npx supabase start; then
    exit 0
  fi
  if [ "$attempt" -eq 4 ]; then
    break
  fi
  echo "Supabase did not start (attempt $attempt); retrying in $((attempt * 30))s."
  npx supabase stop --no-backup >/dev/null 2>&1 || true
  sleep $((attempt * 30))
done

echo "Supabase did not start after 4 attempts." >&2
exit 1
