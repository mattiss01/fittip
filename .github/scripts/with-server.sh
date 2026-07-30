#!/usr/bin/env bash
# Runs a command against a production server started on one port, then always
# stops it again.
#
# Each e2e config pins its own baseURL port and expects the server to already be
# listening, which matches the documented local procedure of starting the app
# before `npm run test:e2e`.
#
# Usage: with-server.sh <port> <command> [args...]

set -euo pipefail

port="$1"
shift

npm run start -- -p "$port" &
server_pid=$!

cleanup() {
  pkill -P "$server_pid" 2>/dev/null || true
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl -sSf -o /dev/null "http://127.0.0.1:${port}/"; then
    break
  fi
  sleep 1
done

# Fails the step with a clear error if the server never became reachable.
curl -sSf -o /dev/null "http://127.0.0.1:${port}/"

"$@"
