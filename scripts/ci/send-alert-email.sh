#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# Mails one plain-text alert through SES, so a failed scheduled workflow
# reaches the alert inbox whatever any one account's GitHub notification
# settings are. Uses `SendRawEmail`, the one SES action the app's IAM
# identity is documented to hold (the same call the magic-link email makes).
#
# Usage: ./send-alert-email.sh "<subject>" "<body>"
# Env:   ALERT_EMAIL            - recipient (repo secret)
#        EMAIL_FROM             - SES-verified sender (repo secret)
#        AWS_ACCESS_KEY_ID      - read by the aws CLI (repo secret)
#        AWS_SECRET_ACCESS_KEY  - read by the aws CLI (repo secret)
#        AWS_REGION             - SES region, read by the aws CLI (repo secret)
#
# Never prints either address: the aws CLI's output is discarded.

set -euo pipefail

subject="${1:-}"
body="${2:-}"

if [ -z "$subject" ] || [ -z "$body" ]; then
  echo "::error::Usage: send-alert-email.sh \"<subject>\" \"<body>\""
  exit 1
fi

missing=""
for name in ALERT_EMAIL EMAIL_FROM; do
  if [ -z "${!name:-}" ]; then
    missing="${missing:+$missing, }$name"
  fi
done
if [ -n "$missing" ]; then
  echo "::error::Cannot send the alert email: $missing is not set"
  exit 1
fi

for tool in aws jq base64; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "::error::Cannot send the alert email: $tool is not installed"
    exit 1
  fi
done

# A header value is one line: a line break would start a new header.
one_line() {
  printf '%s' "$1" | tr '\r\n' '  '
}

payload_file=$(mktemp)
trap 'rm -f "$payload_file"' EXIT

message=$(
  printf 'From: %s\nTo: %s\nSubject: %s\nMIME-Version: 1.0\nContent-Type: text/plain; charset=UTF-8\n\n%s\n' \
    "$(one_line "$EMAIL_FROM")" "$(one_line "$ALERT_EMAIL")" "$(one_line "$subject")" "$body"
)

printf '%s' "$message" | base64 | tr -d '\n' | jq -Rs '{Data: .}' > "$payload_file"

if ! aws ses send-raw-email \
  --cli-binary-format base64 \
  --raw-message "file://${payload_file}" >/dev/null 2>&1; then
  echo "::error::SES refused the alert email (check EMAIL_FROM's verification, the IAM identity's ses:SendRawEmail, and AWS_REGION)"
  exit 1
fi

echo "✓ Alert email sent"
