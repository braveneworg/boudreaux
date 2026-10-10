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
# When the container does not come up, the script prints the container's
# state and its last log lines before it fails: the runner is gone once the
# job ends, so the job log is the only place the cause can be read.
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
log_tail=200

# Best effort: a diagnostic that cannot be read must not hide the failure it
# was meant to explain, so no command here may end the script.
print_diagnostics() {
  echo "--- $container: docker ps -a ---" >&2
  docker ps -a --filter "name=$container" >&2 || true
  echo "--- $container: state ---" >&2
  docker inspect --format \
    'status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} error={{.State.Error}} started={{.State.StartedAt}} finished={{.State.FinishedAt}}' \
    "$container" >&2 || true
  echo "--- $container: last $log_tail log lines ---" >&2
  docker logs --tail "$log_tail" "$container" >&2 || true
  echo "--- end of $container diagnostics ---" >&2
}

fail() {
  echo "❌ $1" >&2
  print_diagnostics
  exit 1
}

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
    # No container exists yet, so there is nothing to diagnose.
    echo "docker pull $image failed after $max_pull_attempts attempts" >&2
    exit 1
  fi
  echo "docker pull failed (attempt $attempt/$max_pull_attempts); retrying in ${pull_retry_delay}s..."
  sleep "$pull_retry_delay"
done

docker run -d --name "$container" \
  -p "$port:$port" \
  -e MONGO_INITDB_DATABASE=boudreaux-e2e \
  "$image" mongod --replSet rs0 --bind_ip_all --port "$port" \
  || fail "MongoDB container could not be started."

# Wait for mongod to accept connections
ready=0
for attempt in $(seq 1 "$max_ready_attempts"); do
  if docker exec "$container" mongosh --port "$port" --eval "db.runCommand({ping:1})" 2>/dev/null; then
    echo "MongoDB is ready"
    ready=1
    break
  fi
  # A container that has exited never answers: fail now instead of polling
  # out the full wait. Only an explicit "false" counts, so a failed inspect
  # cannot end a start that is merely slow.
  running=$(docker inspect --format '{{.State.Running}}' "$container" 2>/dev/null || echo "unknown")
  if [ "$running" = "false" ]; then
    fail "MongoDB container exited before it accepted a connection."
  fi
  echo "Waiting for MongoDB... ($attempt/$max_ready_attempts)"
  sleep "$poll_delay"
done
[ "$ready" -eq 1 ] || fail "MongoDB did not accept a connection after $max_ready_attempts attempts."

# Initiate replica set (ignore "already initialized" errors)
docker exec "$container" mongosh --port "$port" --eval "
  try { rs.initiate({_id:'rs0', members:[{_id:0, host:'localhost:$port'}]}) }
  catch(e) { if (e.codeName !== 'AlreadyInitialized') throw e; }
" || fail "Replica set rs0 could not be initiated."

# Wait for primary election
elected=0
for attempt in $(seq 1 "$max_primary_attempts"); do
  primary=$(docker exec "$container" mongosh --port "$port" --quiet --eval "rs.isMaster().ismaster" 2>/dev/null || echo "false")
  if [ "$primary" = "true" ]; then
    echo "Replica set primary elected"
    elected=1
    break
  fi
  echo "Waiting for primary election... ($attempt/$max_primary_attempts)"
  sleep "$poll_delay"
done
[ "$elected" -eq 1 ] || fail "Replica set rs0 elected no primary after $max_primary_attempts attempts."
