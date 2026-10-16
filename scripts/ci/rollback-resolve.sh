#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# Resolve which version a rollback deploys, and the image digests that
# version was built from (ADR-0021).
#
# Usage: rollback-resolve.sh <requested-version|''> <website-versions.json> <nginx-versions.json>
#
# The JSON files are GitHub packages API listings of the website and nginx
# container packages: an array of `{ name: "sha256:…", metadata: { container:
# { tags: [...] } } }`. deploy.yml tags every built image `sha-<commit>` and,
# once the release exists, `vX.Y.Z`; the forward deploy and the rollback both
# move `latest`, so `latest` is the live image.
#
# Prints `key=value` lines on stdout:
#   live=<vX.Y.Z or empty>   the version tag on the digest that carries latest
#   target=<vX.Y.Z>          the version to deploy
#   website_digest=sha256:…  the website image of the target
#   nginx_digest=sha256:…    the nginx image of the target
#   reason=<one line>
#
# Target: the requested version when one is given, else the version just
# below the live one in version order, else (latest carries no version tag,
# so a forward deploy was mid-flight) the newest version, which is the last
# one that passed its health check. Exits non-zero with no outputs when the
# target has no image in either package, when nothing is older than the live
# version, or when the requested version is not a vX.Y.Z tag.

set -euo pipefail

VERSION_TAG='^v[0-9]+\.[0-9]+\.[0-9]+$'

fail() {
  echo "rollback-resolve: $1" >&2
  exit 1
}

if [ "$#" -ne 3 ]; then
  echo "usage: rollback-resolve.sh <requested-version|''> <website-versions.json> <nginx-versions.json>" >&2
  exit 2
fi

requested="$1"
website_json="$2"
nginx_json="$3"

[ -f "$website_json" ] || fail "website listing '$website_json' not found"
[ -f "$nginx_json" ] || fail "nginx listing '$nginx_json' not found"

if [ -n "$requested" ] && ! printf '%s' "$requested" | grep -Eq "$VERSION_TAG"; then
  fail "requested version '$requested' is not a vX.Y.Z tag"
fi

# `<tag> <digest>` per tag, one package at a time.
tag_lines() {
  jq -r '.[] | .name as $digest | .metadata.container.tags[]? | "\(.) \($digest)"' "$1"
}

# vX.Y.Z tags of one package, newest first. `sort -V` is not portable, so
# sort the three numeric fields; a longer field is a larger number, which is
# what version order wants and text order gets wrong (v4.4310.0 > v4.439.0).
version_tags_desc() {
  tag_lines "$1" | awk '{ print $1 }' | grep -E "$VERSION_TAG" |
    sed 's/^v//' | sort -t. -k1,1nr -k2,2nr -k3,3nr | sed 's/^/v/' | uniq || true
}

digest_for() {
  tag_lines "$1" | awk -v tag="$2" '$1 == tag { print $2; exit }'
}

website_versions=$(version_tags_desc "$website_json")
latest_digest=$(digest_for "$website_json" latest)

live=''
if [ -n "$latest_digest" ]; then
  live=$(tag_lines "$website_json" | awk -v digest="$latest_digest" '$2 == digest { print $1 }' |
    grep -E "$VERSION_TAG" | sed 's/^v//' | sort -t. -k1,1nr -k2,2nr -k3,3nr | sed 's/^/v/' | head -n 1 || true)
fi

if [ -n "$requested" ]; then
  target="$requested"
  reason="deploying the requested version ${target}"
elif [ -n "$live" ]; then
  target=$(printf '%s\n' "$website_versions" | awk -v live="$live" 'found { print; exit } $0 == live { found = 1 }')
  [ -n "$target" ] || fail "no version older than the live ${live} has an image in GHCR"
  reason="live is ${live}; deploying the version just below it, ${target}"
else
  target=$(printf '%s\n' "$website_versions" | head -n 1)
  [ -n "$target" ] || fail "no vX.Y.Z tag in GHCR; nothing to roll back to"
  echo "rollback-resolve: latest carries no version tag (a forward deploy is mid-flight or never finished); treating the newest version as previous" >&2
  reason="latest carries no version tag; deploying the newest version, ${target}"
fi

website_digest=$(digest_for "$website_json" "$target")
[ -n "$website_digest" ] || fail "version ${target} has no website image in GHCR"
nginx_digest=$(digest_for "$nginx_json" "$target")
[ -n "$nginx_digest" ] || fail "version ${target} has no nginx image in GHCR"

echo "rollback-resolve: ${reason}" >&2
printf 'live=%s\n' "$live"
printf 'target=%s\n' "$target"
printf 'website_digest=%s\n' "$website_digest"
printf 'nginx_digest=%s\n' "$nginx_digest"
printf 'reason=%s\n' "$reason"
