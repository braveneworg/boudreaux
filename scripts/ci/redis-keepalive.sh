#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# Sends one PING to the production Upstash Redis over its REST API so the
# free-tier database never goes idle, and fails when the reply is not PONG
# so a deleted or misconfigured database shows up as a red workflow run.
#
# Usage: ./redis-keepalive.sh
# Env:   UPSTASH_REDIS_REST_URL    - REST endpoint (repo secret)
#        UPSTASH_REDIS_REST_TOKEN  - REST bearer token (repo secret)
#
# Prints only the parsed reply — never the URL or token.

set -euo pipefail

if [ -z "${UPSTASH_REDIS_REST_URL:-}" ] || [ -z "${UPSTASH_REDIS_REST_TOKEN:-}" ]; then
  echo "ERROR: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is not installed"
  exit 1
fi

echo "Pinging Upstash Redis..."

response=$(
  curl -fsS --max-time 15 \
    -H "Authorization: Bearer ${UPSTASH_REDIS_REST_TOKEN}" \
    "${UPSTASH_REDIS_REST_URL}/ping" 2>/dev/null
) || {
  echo "❌ PING request failed (HTTP error or timeout) — is the database still there?"
  exit 1
}

result=$(echo "$response" | jq -r '.result' 2>/dev/null || echo "")

if [ "$result" = "PONG" ]; then
  echo "✓ PONG"
  exit 0
fi

echo "❌ Unexpected reply: ${result:-<unparseable>}"
exit 1
