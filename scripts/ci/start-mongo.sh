#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# Starts a single-node mongo:7 replica set on localhost:27018 (container
# mongo-e2e) on a CI runner — the database the E2E suite and the db-contract
# specs run against. Pulls with retries, waits for mongod, initiates rs0,
# waits for a primary. Run by .github/actions/start-mongo.
#
# Usage: bash scripts/ci/start-mongo.sh
# Env:   MONGO_START_PULL_RETRY_DELAY - seconds between image pull attempts
#                                       (default: 15)
#        MONGO_START_POLL_DELAY       - seconds between readiness and
#                                       primary-election polls (default: 2)

set -euo pipefail

image="mongo:7"
container="mongo-e2e"
port=27018
pull_retry_delay="${MONGO_START_PULL_RETRY_DELAY:-15}"
poll_delay="${MONGO_START_POLL_DELAY:-2}"
max_pull_attempts=5
max_ready_attempts=30
max_primary_attempts=15

# Pull the image up front with retries. GitHub-hosted runners share IPs that
# intermittently time out or hit anonymous-pull rate limits against Docker Hub
# ("context deadline exceeded"); a few retries make the pull resilient without
# needing registry credentials.
for attempt in $(seq 1 "$max_pull_attempts"); do
  if docker pull "$image"; then
    echo "Pulled $image"
    break
  fi
  if [ "$attempt" -eq "$max_pull_attempts" ]; then
    echo "docker pull $image failed after $max_pull_attempts attempts" >&2
    exit 1
  fi
  echo "docker pull failed (attempt $attempt/$max_pull_attempts); retrying in ${pull_retry_delay}s..."
  sleep "$pull_retry_delay"
done

docker run -d --name "$container" \
  -p "$port:$port" \
  -e MONGO_INITDB_DATABASE=boudreaux-e2e \
  "$image" mongod --replSet rs0 --bind_ip_all --port "$port"

# Wait for mongod to accept connections
for attempt in $(seq 1 "$max_ready_attempts"); do
  if docker exec "$container" mongosh --port "$port" --eval "db.runCommand({ping:1})" 2>/dev/null; then
    echo "MongoDB is ready"
    break
  fi
  echo "Waiting for MongoDB... ($attempt/$max_ready_attempts)"
  sleep "$poll_delay"
done

# Initiate replica set (ignore "already initialized" errors)
docker exec "$container" mongosh --port "$port" --eval "
  try { rs.initiate({_id:'rs0', members:[{_id:0, host:'localhost:$port'}]}) }
  catch(e) { if (e.codeName !== 'AlreadyInitialized') throw e; }
"

# Wait for primary election
for attempt in $(seq 1 "$max_primary_attempts"); do
  primary=$(docker exec "$container" mongosh --port "$port" --quiet --eval "rs.isMaster().ismaster" 2>/dev/null || echo "false")
  if [ "$primary" = "true" ]; then
    echo "Replica set primary elected"
    break
  fi
  echo "Waiting for primary election... ($attempt/$max_primary_attempts)"
  sleep "$poll_delay"
done
