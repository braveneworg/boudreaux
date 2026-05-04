#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# Revokes a runner IP's temporary SSH access from all Security Groups attached
# to the running EC2 instance. Intended to run as an `if: always()` cleanup step.
#
# Usage: ./revoke-runner-ip.sh <runner-ipv4>
# Env:   AWS_SECURITY_GROUP_ID  - fallback SG ID if instance discovery fails

set -euo pipefail

RUNNER_IP="${1:-}"

if [ -z "$RUNNER_IP" ]; then
  echo "No runner IP provided; nothing to revoke (whitelist step likely never ran). Skipping."
  exit 0
fi

INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=instance-state-name,Values=running" "Name=tag:Name,Values=*" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text 2>/dev/null || echo "")

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
  SG_IDS="${AWS_SECURITY_GROUP_ID:-}"
  if [ -z "$SG_IDS" ]; then
    echo "WARNING: No instance found and AWS_SECURITY_GROUP_ID not set. Cannot revoke rules."
    exit 0
  fi
else
  SG_IDS=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].SecurityGroups[*].GroupId' \
    --output text)
fi

echo "Revoking SSH access from ${RUNNER_IP} on: $SG_IDS"

# Revoke the SSH ingress rule; succeed silently when the rule no longer exists
# (already removed or never added), but fail fast for any other AWS CLI error
# so that unexpected credential/SG issues don't silently leave the runner IP
# whitelisted.
revoke_ssh_rule() {
  local output exit_code
  output=$(aws ec2 revoke-security-group-ingress "$@" 2>&1) && return 0
  exit_code=$?
  if echo "$output" | grep -qE "InvalidPermission\.NotFound|does not exist"; then
    echo "  SSH rule not found (already removed or never added)"
    return 0
  fi
  echo "ERROR: aws ec2 revoke-security-group-ingress failed: $output" >&2
  return $exit_code
}

for SG_ID in $SG_IDS; do
  revoke_ssh_rule \
    --group-id "$SG_ID" \
    --protocol tcp \
    --port 22 \
    --cidr "${RUNNER_IP}/32"
done
