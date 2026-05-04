#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# Verifies the application health endpoint with retry and exponential backoff.
# Supports self-signed certificates (retries with -k on SSL errors).
#
# Usage: ./verify-health.sh
# Env:   HEALTH_URL  - URL to check (default: https://fakefourrecords.com/api/health)

set -euo pipefail

HEALTH_URL="${HEALTH_URL:-https://fakefourrecords.com/api/health}"

echo "Checking application health at $HEALTH_URL"

# Verify jq is available
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is not installed"
  exit 1
fi

max_attempts=5
attempt=1
backoff_base=10
allow_insecure=false

while [ $attempt -le $max_attempts ]; do
  echo "Health check attempt $attempt of $max_attempts..."

  CURL_OPTS="-fsS --max-time 10"
  if [ "$allow_insecure" = true ]; then
    echo "Using insecure mode for self-signed certificate"
    CURL_OPTS="-k $CURL_OPTS"
  fi

  # shellcheck disable=SC2086
  response=$(curl $CURL_OPTS "$HEALTH_URL" 2>&1) || {
    echo "Health check failed (attempt $attempt/$max_attempts)"

    # Check if failure was due to SSL certificate verification
    if echo "$response" | grep -qi "SSL certificate problem\|certificate verify failed"; then
      if [ "$allow_insecure" = false ]; then
        echo "SSL certificate error detected - retrying with insecure mode for self-signed certificates"
        allow_insecure=true
        # Don't increment attempt counter, retry immediately with -k flag
        continue
      fi
    fi

    if [ $attempt -lt $max_attempts ]; then
      sleep_duration=$((backoff_base * (1 << (attempt - 1))))
      echo "Retrying in ${sleep_duration} seconds..."
      sleep "$sleep_duration"
      attempt=$((attempt + 1))
      continue
    else
      echo "❌ All health check attempts failed after $max_attempts attempts"
      echo "Expected: status='healthy' and database='connected'"
      echo "Last response: $response"
      exit 1
    fi
  }

  # Parse and validate the health check response
  status=$(echo "$response" | jq -r '.status' 2>/dev/null || echo "")
  database=$(echo "$response" | jq -r '.database' 2>/dev/null || echo "")

  if [ "$status" = "healthy" ] && [ "$database" = "connected" ]; then
    echo "✓ Application is healthy"
    echo "  Status: $status"
    echo "  Database: $database"
    latency=$(echo "$response" | jq -r '.latency' 2>/dev/null || echo "N/A")
    if [ "$latency" != "N/A" ] && [ "$latency" != "null" ]; then
      echo "  Database latency: ${latency}ms"
    fi
    exit 0
  else
    echo "❌ Health check returned unhealthy status (attempt $attempt/$max_attempts)"
    echo "Response: $response"
    if [ $attempt -lt $max_attempts ]; then
      sleep_duration=$((backoff_base * (1 << (attempt - 1))))
      echo "Retrying in ${sleep_duration} seconds..."
      sleep "$sleep_duration"
      attempt=$((attempt + 1))
      continue
    else
      echo "❌ All health check attempts returned unhealthy status"
      exit 1
    fi
  fi
done
