#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# Print the commit a version was deployed from (ADR-0012, ADR-0021).
#
# Usage: release-deployed-sha.sh <vX.Y.Z> [main-ref]
#
# A version's release commit (`chore(release): vX.Y.Z [skip ci]`, authored by
# github-actions[bot]) carries a `Deployed-Sha:` trailer naming the commit
# the deploy shipped and health-checked. That commit can be older than the
# release commit itself, so the rollback checks it out, not the tag, for the
# host-side files. The lookup goes by subject on [main-ref] (default
# origin/main) rather than by git tag, so it works in a clone without tags.
#
# Prints the 40-character SHA on stdout. Exits non-zero, printing nothing,
# when the version has no release commit, the release commit has no trailer,
# or the trailer names a commit this clone does not have.

set -euo pipefail

RELEASE_AUTHOR='github-actions\[bot\]'

fail() {
  echo "release-deployed-sha: $1" >&2
  exit 1
}

if [ "$#" -lt 1 ] || [ -z "$1" ]; then
  echo "usage: release-deployed-sha.sh <vX.Y.Z> [main-ref]" >&2
  exit 2
fi

version="$1"
main_ref="${2:-origin/main}"

printf '%s' "$version" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$' ||
  fail "version '$version' is not a vX.Y.Z tag"

git rev-parse --verify --quiet "${main_ref}^{commit}" > /dev/null ||
  fail "main ref '${main_ref}' not found in this clone"

# Escape the dots so v4.43.0 cannot match v4.430.0, and anchor on the
# ` [skip ci]` suffix so a prefix of a longer version cannot match either.
subject_pattern="^chore\\(release\\): $(printf '%s' "$version" | sed 's/\./\\./g') \\[skip ci\\]"

release_sha=$(git log "$main_ref" --format='%H' -E \
  --author="$RELEASE_AUTHOR" --grep="$subject_pattern" -n 1)
[ -n "$release_sha" ] || fail "no release commit for ${version} on ${main_ref}"

deployed_sha=$(git log -1 --format='%(trailers:key=Deployed-Sha,valueonly)' "$release_sha" |
  sed '/^[[:space:]]*$/d' | tail -n 1 | tr -d '[:space:]')
[ -n "$deployed_sha" ] || fail "release commit ${release_sha} for ${version} carries no Deployed-Sha trailer"

if ! printf '%s' "$deployed_sha" | grep -Eq '^[0-9a-f]{40}$' ||
  ! git cat-file -e "${deployed_sha}^{commit}" 2> /dev/null; then
  fail "Deployed-Sha '${deployed_sha}' on release ${release_sha} is not a commit in this clone"
fi

echo "$deployed_sha"
