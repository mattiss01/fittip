#!/usr/bin/env bash
# Runs the named browser flows one after another, each against its own
# production server, and fails at the end if any of them failed.
#
# A later flow still runs after an earlier one fails, so one run reports every
# broken flow rather than just the first.
#
# Each flow writes to its own artifact directories. Playwright clears its
# output directory when it starts, so a shared one would let a later flow
# destroy the trace of an earlier failure.
#
# Every flow runs one worker at a time. The runner also hosts the Supabase
# stack and the application server, so parallel workers make these flows slower
# and less deterministic than the documented local run. The workflow gets its
# parallelism from separate runners instead.
#
# Usage: browser-flows.sh <flow> [flow...]

set -uo pipefail

# The port each flow's config pins as its baseURL.
port_for() {
  case "$1" in
    auth) echo 3000 ;;
    m2-01) echo 3015 ;;
    m2-02) echo 3016 ;;
    m3-16a) echo 3019 ;;
    m3-12) echo 3020 ;;
    m3-13) echo 3021 ;;
    m3-14b) echo 3022 ;;
    m3-19) echo 3023 ;;
    m3-15b) echo 3024 ;;
    m3-15c) echo 3025 ;;
    m3-15f) echo 3026 ;;
    *) return 1 ;;
  esac
}

if [ "$#" -eq 0 ]; then
  echo "::error::browser-flows.sh was given no flow to run."
  exit 1
fi

failed=()

for flow in "$@"; do
  if ! port="$(port_for "$flow")"; then
    echo "::error::Unknown browser flow '${flow}'."
    failed+=("$flow")
    continue
  fi

  if [ "$flow" = "auth" ]; then
    # The root config's 60s test timeout is raised here because the runner is
    # shared. The per-ticket configs already set their own longer timeouts and
    # are deliberately left alone.
    target=(e2e/auth.spec.ts --timeout=180000)
  else
    target=("--config=e2e/${flow}.playwright.config.ts")
  fi

  echo "::group::${flow}"
  if ! PLAYWRIGHT_HTML_REPORT="playwright-report/${flow}" \
    .github/scripts/with-server.sh "$port" \
    npx playwright test "${target[@]}" \
    --workers=1 --trace=retain-on-failure \
    "--output=test-results/${flow}"; then
    failed+=("$flow")
  fi
  echo "::endgroup::"
done

if [ "${#failed[@]}" -gt 0 ]; then
  for flow in "${failed[@]}"; do
    echo "::error title=Browser flow failed::${flow}"
  done
  exit 1
fi
