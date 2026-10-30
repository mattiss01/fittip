#!/usr/bin/env bash
# Decides whether this push needs the suites at all, and writes run=true or
# run=false to $GITHUB_OUTPUT.
#
# A merge to `master` brings code that already passed on its ticket branch,
# plus the log row. Measured 15-30 Oct 2026: 55 of 65 `master` runs tested code
# identical to a green ticket run, about a quarter of all CI minutes, and caught
# nothing those ticket runs had not. A push that only changes Markdown in docs/
# or CLAUDE.md is the same case: Prettier ignores those files and no test reads
# them.
#
# So the suites are skipped when a green run of this workflow already tested a
# commit whose files, those Markdown files aside, are identical to this one.
# Everything else counts: the workflow, the lockfile, the migrations. A merge
# whose master moved since the ticket's run differs, and runs in full. A
# re-run of the same commit never finds itself, so `gh run rerun` always runs
# the suites, and so does a manual dispatch.
#
# Needs a full checkout (fetch-depth: 0), GH_TOKEN with actions: read, and
# GH_REPO.

set -euo pipefail

decide() {
  echo "run=$1" >>"$GITHUB_OUTPUT"
  echo "$2"
}

if [ "$GITHUB_EVENT_NAME" != "push" ]; then
  decide true "A ${GITHUB_EVENT_NAME} event: the suites run."
  exit 0
fi

untested=(':(exclude,glob)docs/**/*.md' ':(exclude)CLAUDE.md')

for sha in $(gh run list --workflow ci.yml --status success --limit 50 \
  --json headSha --jq '.[].headSha' | sort -u); do
  if [ "$sha" = "$GITHUB_SHA" ] || ! git cat-file -e "${sha}^{commit}" 2>/dev/null; then
    continue
  fi
  if git diff --quiet "$sha" "$GITHUB_SHA" -- . "${untested[@]}"; then
    decide false "Already tested: ${sha} passed with the same code; only Markdown in docs/ or CLAUDE.md differs. The suites are skipped."
    exit 0
  fi
done

decide true "No green run has tested this code yet: the suites run."
