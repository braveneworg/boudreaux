#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# Ensures HTTP (80) and HTTPS (443) ingress rules exist on all Security Groups
# attached to the running EC2 instance. Falls back to AWS_SECURITY_GROUP_ID if
# the instance cannot be auto-discovered.
#
# Usage: ./ensure-security-groups.sh
# Env:   AWS_SECURITY_GROUP_ID  - fallback SG ID if instance discovery fails

set -euo pipefail

# Discover instance ID by running state and name tag
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=instance-state-name,Values=running" "Name=tag:Name,Values=*" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text 2>/dev/null || echo "")

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
  echo "WARNING: Could not auto-discover instance. Falling back to AWS_SECURITY_GROUP_ID if set."
  if [ -n "${AWS_SECURITY_GROUP_ID:-}" ]; then
    SG_IDS="${AWS_SECURITY_GROUP_ID}"
  else
    echo "ERROR: No instance found and AWS_SECURITY_GROUP_ID not set. Cannot ensure Security Group rules."
    exit 1
  fi
else
  echo "Found instance: $INSTANCE_ID"
  # Get all Security Groups attached to this instance
  SG_IDS=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].SecurityGroups[*].GroupId' \
    --output text)
fi

echo "Security Groups to configure: $SG_IDS"

# Authorize an ingress rule, succeeding silently when the rule already exists.
# Fails with the original exit code for any other AWS CLI error (auth, wrong
# region, throttling, malformed params, etc.).
authorize_ingress_rule() {
  local output exit_code
  output=$(aws ec2 authorize-security-group-ingress "$@" 2>&1) && return 0
  exit_code=$?
  if echo "$output" | grep -qE "InvalidPermission\.Duplicate|already exists"; then
    echo "  Rule already exists (idempotent)"
    return 0
  fi
  echo "ERROR: aws ec2 authorize-security-group-ingress failed: $output" >&2
  return $exit_code
}

# Like authorize_ingress_rule but also tolerates VPCs without IPv6 support.
authorize_ingress_rule_ipv6() {
  local output exit_code
  output=$(aws ec2 authorize-security-group-ingress "$@" 2>&1) && return 0
  exit_code=$?
  if echo "$output" | grep -qE "InvalidPermission\.Duplicate|already exists|InvalidParameterValue"; then
    echo "  Rule already exists or IPv6 not supported (idempotent)"
    return 0
  fi
  echo "ERROR: aws ec2 authorize-security-group-ingress failed: $output" >&2
  return $exit_code
}

# For each Security Group, ensure HTTP/HTTPS are open.
# Port 80: Needed for Let's Encrypt ACME HTTP-01 challenges and HTTP→HTTPS redirect.
# Port 443: HTTPS traffic for the website.
for SG_ID in $SG_IDS; do
  echo "Ensuring ports 80/443 open on $SG_ID..."

  # Rule descriptions must match the AWS-allowed charset:
  #   a-zA-Z0-9. _-:/()#,@[]+=&;{}!$*  (apostrophes are NOT allowed)

  # IPv4
  authorize_ingress_rule \
    --group-id "$SG_ID" \
    --ip-permissions 'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0,Description="HTTP for web traffic and ACME challenges"}]'

  authorize_ingress_rule \
    --group-id "$SG_ID" \
    --ip-permissions 'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0,Description="HTTPS for web traffic"}]'

  # IPv6 (tolerated if VPC has no IPv6 support)
  authorize_ingress_rule_ipv6 \
    --group-id "$SG_ID" \
    --ip-permissions 'IpProtocol=tcp,FromPort=80,ToPort=80,Ipv6Ranges=[{CidrIpv6=::/0,Description="HTTP IPv6"}]'

  authorize_ingress_rule_ipv6 \
    --group-id "$SG_ID" \
    --ip-permissions 'IpProtocol=tcp,FromPort=443,ToPort=443,Ipv6Ranges=[{CidrIpv6=::/0,Description="HTTPS IPv6"}]'
done

echo "Security Group configuration complete."
