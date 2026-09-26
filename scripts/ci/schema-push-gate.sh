#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# Decide whether a deploy must run `prisma db push` (ADR-0012).
#
# Usage: schema-push-gate.sh <head-sha> [main-ref]
#
# Prints exactly one word on stdout — `push` or `skip` — and the reason on
# stderr. Exits non-zero, printing no decision, when <head-sha> or
# [main-ref] (default origin/main) cannot be resolved.
#
# The last deployed commit comes from the `Deployed-Sha:` trailer on the
# newest release commit (subject `chore(release): v…`, authored by
# github-actions[bot]) on [main-ref] that carries one. deploy.yml's
# version-bump job writes that trailer only after a deploy passed its health
# check. The decision is a tree comparison of prisma/schema.prisma at that
# commit and at <head-sha>, so it holds whatever order commits merged in and
# for a rollback to an older commit.
#
#   no release commit carries the marker  -> skip (the first release writes it)
#   marker is not a commit in this clone  -> push (fail safe)
#   schema differs, or is new at head     -> push
#   schema identical                      -> skip

set -eu

SCHEMA_PATH='prisma/schema.prisma'
RELEASE_AUTHOR='github-actions\[bot\]'
RELEASE_SUBJECT='^chore\(release\): v'

decide() {
  echo "schema-push-gate: $2" >&2
  echo "$1"
  exit 0
}

if [ "$#" -lt 1 ] || [ -z "$1" ]; then
  echo "usage: schema-push-gate.sh <head-sha> [main-ref]" >&2
  exit 2
fi

head_ref="$1"
main_ref="${2:-origin/main}"

if ! head_sha=$(git rev-parse --verify --quiet "${head_ref}^{commit}"); then
  echo "schema-push-gate: head commit '${head_ref}' not found in this clone" >&2
  exit 1
fi

if ! git rev-parse --verify --quiet "${main_ref}^{commit}" > /dev/null; then
  echo "schema-push-gate: main ref '${main_ref}' not found in this clone" >&2
  exit 1
fi

# Newest bot-authored release commit that carries a Deployed-Sha trailer.
deployed_sha=''
release_sha=''
while IFS= read -r candidate; do
  [ -n "$candidate" ] || continue
  marker=$(git log -1 --format='%(trailers:key=Deployed-Sha,valueonly)' "$candidate" |
    sed '/^[[:space:]]*$/d' | tail -n 1 | tr -d '[:space:]')
  if [ -n "$marker" ]; then
    deployed_sha="$marker"
    release_sha="$candidate"
    break
  fi
done < <(git log "$main_ref" --format='%H' -E \
  --author="$RELEASE_AUTHOR" --grep="$RELEASE_SUBJECT")

if [ -z "$deployed_sha" ]; then
  decide skip "no release commit on ${main_ref} carries a Deployed-Sha marker yet; the first release writes it"
fi

if ! printf '%s' "$deployed_sha" | grep -Eq '^[0-9a-f]{40}$' ||
  ! git cat-file -e "${deployed_sha}^{commit}" 2> /dev/null; then
  decide push "Deployed-Sha '${deployed_sha}' on release ${release_sha} is not a commit in this clone (unknown); pushing to be safe"
fi

if git diff --quiet "$deployed_sha" "$head_sha" -- "$SCHEMA_PATH"; then
  decide skip "${SCHEMA_PATH} unchanged between deployed ${deployed_sha} and ${head_sha}"
fi

decide push "${SCHEMA_PATH} differs between deployed ${deployed_sha} and ${head_sha}"
