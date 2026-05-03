#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# Temporarily whitelists a runner IP for SSH on all Security Groups attached
# to the running EC2 instance. Falls back to AWS_SECURITY_GROUP_ID if instance
# cannot be auto-discovered.
#
# Usage: ./whitelist-runner-ip.sh <runner-ipv4>
# Env:   AWS_SECURITY_GROUP_ID  - fallback SG ID if instance discovery fails

set -euo pipefail

RUNNER_IP="${1:?Usage: $0 <runner-ipv4>}"

# Reuse the instance discovery logic from ensure-security-groups.sh
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=instance-state-name,Values=running" "Name=tag:Name,Values=*" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text 2>/dev/null || echo "")

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
  SG_IDS="${AWS_SECURITY_GROUP_ID:-}"
  if [ -z "$SG_IDS" ]; then
    echo "ERROR: No instance found and AWS_SECURITY_GROUP_ID not set."
    exit 1
  fi
else
  SG_IDS=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].SecurityGroups[*].GroupId' \
    --output text)
fi

echo "Adding temporary SSH access from ${RUNNER_IP} to: $SG_IDS"

for SG_ID in $SG_IDS; do
  aws ec2 authorize-security-group-ingress \
    --group-id "$SG_ID" \
    --protocol tcp \
    --port 22 \
    --cidr "${RUNNER_IP}/32" \
    2>&1 | grep -v "already exists" || true
done
