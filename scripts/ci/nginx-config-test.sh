#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# Proves nginx/nginx.conf is valid nginx syntax by building the production
# nginx image (nginx/Dockerfile) and running `nginx -t` inside it.
#
# The config is otherwise parsed only by the real nginx at deploy time: CI E2E
# talks to the standalone server directly, and nginx.conf.spec.ts checks
# routing rules by parsing the file, not by asking nginx. A bare `nginx -t`
# cannot run outside the compose network either —
#   - `upstream … { server website:3000; }` and `proxy_pass http://website:3000`
#     resolve `website` at parse time ("host not found in upstream"), and
#   - `ssl_certificate(_key) /run/secrets/ssl_*` must be a loadable pair —
# so this script aliases `website` to loopback and mounts a throwaway
# self-signed certificate pair where the config expects the real one.
#
# Usage: bash scripts/ci/nginx-config-test.sh [repo-root]
# Env:   NGINX_TEST_IMAGE        - tag for the throwaway image
#                                  (default: boudreaux-nginx-config-test)
#        NGINX_TEST_RETRY_DELAY  - seconds between image build attempts
#                                  (default: 10)

set -euo pipefail

root="${1:-.}"
image="${NGINX_TEST_IMAGE:-boudreaux-nginx-config-test}"
retry_delay="${NGINX_TEST_RETRY_DELAY:-10}"
dockerfile="$root/nginx/Dockerfile"
config="$root/nginx/nginx.conf"
max_build_attempts=3

fail() {
  echo "❌ $1" >&2
  exit 1
}

[ -f "$dockerfile" ] || fail "Cannot read '$dockerfile' (nginx/Dockerfile). Pass the repo root as the first argument."
[ -f "$config" ] || fail "Cannot read '$config' (nginx/nginx.conf). Pass the repo root as the first argument."
command -v docker >/dev/null 2>&1 || fail "docker is not installed."
command -v openssl >/dev/null 2>&1 || fail "openssl is not installed."

secrets=$(mktemp -d)
trap 'rm -rf "$secrets"' EXIT
cert="$secrets/ssl_cert"
key="$secrets/ssl_key"

# nginx refuses to parse an `ssl` server block without a loadable certificate
# and matching key. The real pair lives only on the EC2 host, so generate a
# one-day self-signed pair that exists solely for this parse.
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=ci \
  -keyout "$key" -out "$cert" >/dev/null 2>&1 \
  || fail "openssl could not generate a throwaway certificate pair."
# The container reads the mounts as root; the key's default 0600 is fine, but
# make both world-readable so a user-namespaced daemon cannot trip on them.
chmod 644 "$cert" "$key"

echo "Building nginx image from $dockerfile..."
built=0
for attempt in $(seq 1 "$max_build_attempts"); do
  if docker build --quiet -f "$dockerfile" -t "$image" "$root" >/dev/null; then
    built=1
    break
  fi

  # GitHub-hosted runners share IPs that intermittently time out or hit
  # anonymous-pull rate limits against Docker Hub (the nginx:alpine base
  # image); a few retries make the pull resilient without registry
  # credentials.
  if [ "$attempt" -lt "$max_build_attempts" ]; then
    echo "docker build failed (attempt $attempt/$max_build_attempts); retrying in ${retry_delay}s..." >&2
    sleep "$retry_delay"
  fi
done
[ "$built" -eq 1 ] || fail "nginx image build failed after $max_build_attempts attempts."

echo "Running nginx -t inside $image..."
if docker run --rm \
  --add-host website:127.0.0.1 \
  -v "$cert:/run/secrets/ssl_cert:ro" \
  -v "$key:/run/secrets/ssl_key:ro" \
  "$image" nginx -t; then
  echo "✅ nginx/nginx.conf is valid nginx syntax"
  exit 0
fi

fail "nginx -t rejected nginx/nginx.conf — see the nginx output above."
