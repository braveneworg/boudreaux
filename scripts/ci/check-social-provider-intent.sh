#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# Fail the deploy when a social provider the operator intends to offer has
# empty credentials (ADR-0024).
#
# The repo cannot see GitHub secret names, so a secret created under the
# wrong name (AUTH_FACEBOOK_* instead of FACEBOOK_CLIENT_*, 2026-11-05)
# reaches the container empty, the app skips the provider, and nothing says
# so. ENABLED_SOCIAL_PROVIDERS (a repository variable, comma-separated,
# e.g. `google,apple,facebook`, or `none`) states the intent; this check
# compares it with the credentials roll-host.yml is about to write. It runs
# before the env file is written or the host is touched, so a failure leaves
# production on the version it already runs.
#
# Env (required): ENABLED_SOCIAL_PROVIDERS
# Env (checked):  GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET
#                 FACEBOOK_CLIENT_ID FACEBOOK_CLIENT_SECRET
#                 TWITTER_CLIENT_ID TWITTER_CLIENT_SECRET
#                 APPLE_CLIENT_ID and APPLE_CLIENT_SECRET, or
#                 APPLE_TEAM_ID APPLE_KEY_ID APPLE_PRIVATE_KEY_BASE64
#
# Only names are printed, never values. Exits 1 on any unmet intent.

set -euo pipefail

if [ -z "${ENABLED_SOCIAL_PROVIDERS:-}" ]; then
  echo "::error::ENABLED_SOCIAL_PROVIDERS is not set. List the social providers to offer (e.g. google,apple,facebook) or set it to none."
  exit 1
fi

# The names in "$@" that are unset or blank, comma-separated.
empty_names() {
  local name value missing=''
  for name in "$@"; do
    value="${!name:-}"
    if [ -z "${value//[[:space:]]/}" ]; then
      missing="${missing:+$missing,}$name"
    fi
  done
  echo "$missing"
}

# What an intended provider still needs, or nothing when it is complete.
missing_for() {
  case "$1" in
    google) empty_names GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET ;;
    facebook) empty_names FACEBOOK_CLIENT_ID FACEBOOK_CLIENT_SECRET ;;
    twitter) empty_names TWITTER_CLIENT_ID TWITTER_CLIENT_SECRET ;;
    apple)
      local id minted static
      id="$(empty_names APPLE_CLIENT_ID)"
      minted="$(empty_names APPLE_TEAM_ID APPLE_KEY_ID APPLE_PRIVATE_KEY_BASE64)"
      static="$(empty_names APPLE_CLIENT_SECRET)"
      if [ -n "$minted" ] && [ -n "$static" ]; then
        # Neither secret source is complete: name the key material, the
        # source production uses.
        echo "${id:+$id,}$minted (or APPLE_CLIENT_SECRET)"
      else
        echo "$id"
      fi
      ;;
    *) echo "unknown" ;;
  esac
}

normalized="$(printf '%s' "$ENABLED_SOCIAL_PROVIDERS" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
if [ "$normalized" = "none" ]; then
  echo "ENABLED_SOCIAL_PROVIDERS=none: no social provider is expected."
  exit 0
fi

failed=0
IFS=',' read -r -a providers <<< "$normalized"
for provider in "${providers[@]}"; do
  [ -n "$provider" ] || continue
  missing="$(missing_for "$provider")"
  if [ "$missing" = "unknown" ]; then
    echo "::error::ENABLED_SOCIAL_PROVIDERS names '$provider', which is not a known provider (google, apple, facebook, twitter)."
    failed=1
  elif [ -n "$missing" ]; then
    echo "::error::'$provider' is in ENABLED_SOCIAL_PROVIDERS but these secrets are empty: $missing. Create them under exactly these names, or remove '$provider' from the variable."
    failed=1
  else
    echo "✓ $provider: credentials present"
  fi
done

exit "$failed"
