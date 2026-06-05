#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# speckit-next-feature.sh — compute the next grouped feature branch + spec dir
# for the "<group>/<NNN>-<short-name>" scheme (see CLAUDE.md "Spec Kit feature
# naming"). READ-ONLY: it only computes names; the /speckit-specify git hook and
# skill create the actual branch and directory via the GIT_BRANCH_NAME and
# SPECIFY_FEATURE_DIRECTORY overrides this prints.
#
# Usage: scripts/speckit-next-feature.sh [--json] <short-name> [group]
#   group defaults to "feature".
#
# Output (shell-eval friendly):
#   GIT_BRANCH_NAME=feature/003-user-auth
#   SPECIFY_FEATURE_DIRECTORY=specs/feature/003-user-auth
# With --json:
#   {"GIT_BRANCH_NAME":"...","SPECIFY_FEATURE_DIRECTORY":"...","FEATURE_NUM":"003"}

set -euo pipefail

JSON=false
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --json) JSON=true ;;
    -h | --help)
      echo "Usage: $0 [--json] <short-name> [group]"
      exit 0
      ;;
    *) ARGS+=("$arg") ;;
  esac
done

SHORT_RAW="${ARGS[0]:-}"
GROUP_RAW="${ARGS[1]:-feature}"

if [ -z "$SHORT_RAW" ]; then
  echo "Error: short-name required. Usage: $0 [--json] <short-name> [group]" >&2
  exit 1
fi

# Lowercase, replace non-alphanumerics with hyphens, collapse/strip hyphens.
clean() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/-\{2,\}/-/g; s/^-//; s/-$//'
}

SHORT="$(clean "$SHORT_RAW")"
GROUP="$(clean "$GROUP_RAW")"

if [ -z "$SHORT" ]; then
  echo "Error: short-name is empty after normalization" >&2
  exit 1
fi
if [ -z "$GROUP" ]; then
  echo "Error: group is empty after normalization" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Emit, one per line, every "<NNN>-..." name already used within this group:
# spec directories under specs/<group>/, plus local and remote branch names
# under <group>/. Remote refs are read with ls-remote (no fetch / side effects).
collect_names() {
  if [ -d "$REPO_ROOT/specs/$GROUP" ]; then
    ls -1 "$REPO_ROOT/specs/$GROUP" 2>/dev/null || true
  fi
  git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads 2>/dev/null \
    | sed -nE "s#^${GROUP}/##p" || true
  for remote in $(git -C "$REPO_ROOT" remote 2>/dev/null || true); do
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_ROOT" ls-remote --heads "$remote" 2>/dev/null \
      | sed 's#.*refs/heads/##' | sed -nE "s#^${GROUP}/##p" || true
  done
}

# Highest existing number in the group. Process substitution keeps the loop in
# the current shell so `highest` survives (a pipe would run it in a subshell).
highest=0
while IFS= read -r name; do
  [ -z "$name" ] && continue
  num="$(printf '%s' "$name" | sed -nE 's#^0*([0-9]+)-.*#\1#p')"
  [ -z "$num" ] && continue
  if [ "$num" -gt "$highest" ]; then
    highest="$num"
  fi
done < <(collect_names)

NNN="$(printf '%03d' "$((highest + 1))")"
BRANCH="$GROUP/$NNN-$SHORT"
DIR="specs/$GROUP/$NNN-$SHORT"

if [ "$JSON" = true ]; then
  printf '{"GIT_BRANCH_NAME":"%s","SPECIFY_FEATURE_DIRECTORY":"%s","FEATURE_NUM":"%s"}\n' \
    "$BRANCH" "$DIR" "$NNN"
else
  printf 'GIT_BRANCH_NAME=%s\n' "$BRANCH"
  printf 'SPECIFY_FEATURE_DIRECTORY=%s\n' "$DIR"
fi
