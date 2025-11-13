#!/bin/bash

# Manually create and attach OAC to CloudFront distribution

set -e

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

echo "=== Manually Configuring CloudFront OAC ==="
echo ""

# Step 1: Create OAC
echo "Creating Origin Access Control..."
OAC_OUTPUT=$(aws cloudfront create-origin-access-control \
  --origin-access-control-config '{
    "Name": "S3-OAC-fakefourmedia",
    "Description": "OAC for fakefourmedia S3 bucket",
    "SigningProtocol": "sigv4",
    "SigningBehavior": "always",
    "OriginAccessControlOriginType": "s3"
  }' \
  --output json)

OAC_ID=$(echo "$OAC_OUTPUT" | jq -r '.OriginAccessControl.Id')
echo "✓ Created OAC: $OAC_ID"
echo ""

# Step 2: Get current distribution config
echo "Fetching current distribution configuration..."
DIST_CONFIG=$(aws cloudfront get-distribution-config \
  --id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --output json)

ETAG=$(echo "$DIST_CONFIG" | jq -r '.ETag')
echo "Current ETag: $ETAG"
echo ""

# Step 3: Update distribution to use OAC
echo "Attaching OAC to CloudFront distribution..."
UPDATED_CONFIG=$(echo "$DIST_CONFIG" | jq --arg oac_id "$OAC_ID" \
  '.DistributionConfig.Origins.Items[0].OriginAccessControlId = $oac_id |
   .DistributionConfig.Origins.Items[0].S3OriginConfig.OriginAccessIdentity = ""')

# Save to temp file
echo "$UPDATED_CONFIG" | jq '.DistributionConfig' > /tmp/dist-config.json

# Update distribution
aws cloudfront update-distribution \
  --id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --distribution-config file:///tmp/dist-config.json \
  --if-match "$ETAG"

echo "✓ CloudFront distribution updated with OAC"
echo ""
echo "⏳ Distribution is now deploying (this takes 10-15 minutes)"
echo ""
echo "After deployment completes, all assets should load correctly."
echo ""
echo "=== Configuration Complete ==="
