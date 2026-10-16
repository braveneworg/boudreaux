#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# Decide whether a rollback crosses a destructive schema change (ADR-0021).
#
# Usage: schema-rollback-tripwire.sh <live-sha> <target-sha>
#
# A rollback never pushes the Prisma schema; on MongoDB a push only makes
# collections and indexes match, and the live version's additions are
# harmless to older code. What older code may need is a field, a type, or an
# index that the live version removed. Those show up as lines the target's
# prisma/schema.prisma has and the live one lacks.
#
# Prints exactly one word on stdout — `clear` or `blocked` — and the schema
# diff (live → target) on stderr, so the run summary can show it. Comment and
# blank lines never count. Exits non-zero, printing no decision, when either
# commit cannot be resolved.

set -euo pipefail

SCHEMA_PATH='prisma/schema.prisma'

fail() {
  echo "schema-rollback-tripwire: $1" >&2
  exit 1
}

if [ "$#" -ne 2 ] || [ -z "$1" ] || [ -z "$2" ]; then
  echo "usage: schema-rollback-tripwire.sh <live-sha> <target-sha>" >&2
  exit 2
fi

live_sha=$(git rev-parse --verify --quiet "$1^{commit}") || fail "live commit '$1' not found in this clone"
target_sha=$(git rev-parse --verify --quiet "$2^{commit}") || fail "target commit '$2' not found in this clone"

diff_output=$(git diff "$live_sha" "$target_sha" -- "$SCHEMA_PATH")

if [ -z "$diff_output" ]; then
  echo "schema-rollback-tripwire: ${SCHEMA_PATH} identical at ${live_sha} and ${target_sha}" >&2
  echo clear
  exit 0
fi

printf '%s\n' "$diff_output" >&2

# Lines the target has that live lacks: `+` lines of the live→target diff,
# minus the `+++` file header, blank lines, and `//` comments.
removed_by_live=$(printf '%s\n' "$diff_output" |
  grep -E '^\+' | grep -Ev '^\+\+\+ ' | sed 's/^+//' |
  grep -Ev '^[[:space:]]*$' | grep -Ev '^[[:space:]]*//' || true)

if [ -n "$removed_by_live" ]; then
  echo "schema-rollback-tripwire: the live version removed or changed schema the target has:" >&2
  printf '%s\n' "$removed_by_live" >&2
  echo blocked
  exit 0
fi

echo "schema-rollback-tripwire: the live version only added to ${SCHEMA_PATH}; older code reads past additions" >&2
echo clear
