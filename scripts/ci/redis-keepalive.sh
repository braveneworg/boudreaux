#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# Writes one record to the production Upstash Redis over its REST API so the
# free-tier database sees real usage every day, and fails when the write is
# not accepted so a deleted or misconfigured database shows up as a red
# workflow run. A bare PING was not enough: the database was lost on
# 2026-11-10 after two months of successful daily PINGs.
#
# The record is `SET keepalive:last-run <UTC time of the run>`, expiring
# after seven days: each run overwrites it, and it removes itself if the
# keepalive is ever retired. Nothing in the app reads the key.
#
# A failure names its cause: curl's exit code when no HTTP reply came back
# (the host no longer resolves, a timeout), otherwise the HTTP status and
# the `error` Upstash returned (a rejected token, a read-only token, a spent
# quota). The same one-line reason is written to GITHUB_OUTPUT as `reason`
# for the alert step.
#
# Usage: ./redis-keepalive.sh
# Env:   UPSTASH_REDIS_REST_URL    - REST endpoint (repo secret)
#        UPSTASH_REDIS_REST_TOKEN  - REST bearer token with write access (repo secret)
#        GITHUB_OUTPUT             - step output file (set by the runner)
#
# Never prints the URL or the token: curl's stderr names the host, so it is
# discarded, and both values are redacted from any error text the reply holds.

set -euo pipefail

MAX_TIME_SECONDS=15
MAX_ERROR_CHARS=200
KEEPALIVE_KEY="keepalive:last-run"
KEEPALIVE_TTL_SECONDS=$((7 * 24 * 60 * 60))

if [ -z "${UPSTASH_REDIS_REST_URL:-}" ] || [ -z "${UPSTASH_REDIS_REST_TOKEN:-}" ]; then
  echo "ERROR: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is not installed"
  exit 1
fi

# Prints the reason, records it for the alert step, and fails the run.
fail() {
  local reason="$1"
  echo "❌ $reason"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "reason=$reason" >> "$GITHUB_OUTPUT"
  fi
  exit 1
}

body_file=$(mktemp)
trap 'rm -f "$body_file"' EXIT

# Upstash's REST API takes a Redis command as a JSON array in the POST body.
command=$(
  jq -cn \
    --arg key "$KEEPALIVE_KEY" \
    --arg value "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg ttl "$KEEPALIVE_TTL_SECONDS" \
    '["SET", $key, $value, "EX", $ttl]'
)

echo "Writing the keepalive record to Upstash Redis..."

curl_exit=0
http_code=$(
  curl -sS --max-time "$MAX_TIME_SECONDS" \
    -o "$body_file" \
    -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${UPSTASH_REDIS_REST_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$command" \
    "${UPSTASH_REDIS_REST_URL}" 2>/dev/null
) || curl_exit=$?

case "$curl_exit" in
  0) ;;
  6)
    fail "The database host does not resolve (curl exit 6): Upstash has deleted the database, or its endpoint changed and UPSTASH_REDIS_REST_URL is stale."
    ;;
  28)
    fail "The keepalive write timed out after ${MAX_TIME_SECONDS}s (curl exit 28)."
    ;;
  *)
    fail "The keepalive write got no HTTP reply (curl exit ${curl_exit})."
    ;;
esac

result=$(jq -r '.result // empty' "$body_file" 2>/dev/null || echo "")

if [ "$http_code" = "200" ] && [ "$result" = "OK" ]; then
  echo "✓ Wrote ${KEEPALIVE_KEY}"
  exit 0
fi

# The error Upstash sent, on one line, capped, with both secrets redacted.
endpoint_host="${UPSTASH_REDIS_REST_URL#*://}"
endpoint_host="${endpoint_host%%/*}"
error=$(jq -r '.error // empty' "$body_file" 2>/dev/null || echo "")
error=$(printf '%s' "$error" | tr '\r\n' '  ' | cut -c "1-${MAX_ERROR_CHARS}")
error="${error//"$UPSTASH_REDIS_REST_TOKEN"/***}"
error="${error//"$endpoint_host"/***}"
detail="${error:+ Upstash said: ${error}}"

case "$http_code" in
  200)
    fail "Unexpected reply to the keepalive write (HTTP 200, not OK).${detail}"
    ;;
  401 | 403)
    fail "Upstash rejected the token (HTTP ${http_code}): it was rotated, or the database was recreated and UPSTASH_REDIS_REST_TOKEN is stale.${detail}"
    ;;
  *)
    fail "Upstash answered the keepalive write with HTTP ${http_code}.${detail}"
    ;;
esac
