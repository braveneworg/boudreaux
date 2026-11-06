#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# Fail the deploy, before the host is touched, when a required runtime value
# is empty (ADR-0024).
#
# In production the website refuses to boot without its required values
# (src/lib/config/boot-check.ts). Checking the same names here, on the
# runner, turns a missing secret into a red run while the host keeps serving
# the version it runs, instead of a container that will not start.
#
# Usage: check-required-config.sh NAME...
#   Each NAME must be set, non-blank, in the environment. AUTH_SECRET and
#   JOB_CALLBACK_SECRET must also be at least 32 characters, the floor the
#   boot check enforces. roll-host.yml passes the manifest's required
#   runtime names; scripts/ci/runtime-config-drift.spec.ts keeps the list in
#   step with src/lib/config/env-manifest.ts.
#
# Only names are printed, never values. Exits 1 on any problem.

set -euo pipefail

MIN_SECRET_LENGTH=32

if [ "$#" -eq 0 ]; then
  echo "::error::check-required-config.sh was given no names to check."
  exit 1
fi

missing=''
failed=0
for name in "$@"; do
  value="${!name:-}"
  if [ -z "${value//[[:space:]]/}" ]; then
    missing="${missing:+$missing, }$name"
    continue
  fi
  case "$name" in
    AUTH_SECRET | JOB_CALLBACK_SECRET)
      if [ "${#value}" -lt "$MIN_SECRET_LENGTH" ]; then
        echo "::error::$name must be at least $MIN_SECRET_LENGTH characters."
        failed=1
      fi
      ;;
  esac
done

if [ -n "$missing" ]; then
  echo "::error::Required secrets are empty: $missing. The website will not boot without them; create them under exactly these names."
  failed=1
fi

if [ "$failed" -eq 0 ]; then
  echo "✓ $# required runtime values present"
fi
exit "$failed"
