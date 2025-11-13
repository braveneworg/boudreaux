#!/bin/bash

# Quick fix script to update CloudFront Origin Path
# This will fix the 403 errors immediately

set -e

echo "=== CloudFront Origin Path Fix ==="
echo ""

# Load environment variables
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

if [ -z "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
  echo "Error: CLOUDFRONT_DISTRIBUTION_ID must be set in .env"
  exit 1
fi

echo "CloudFront Distribution: $CLOUDFRONT_DISTRIBUTION_ID"
echo ""

# Get current distribution config
echo "Fetching current distribution configuration..."
DIST_CONFIG=$(aws cloudfront get-distribution-config \
  --id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --output json)

ETAG=$(echo "$DIST_CONFIG" | jq -r '.ETag')
CURRENT_ORIGIN_PATH=$(echo "$DIST_CONFIG" | jq -r '.DistributionConfig.Origins.Items[0].OriginPath')

echo "Current Origin Path: $CURRENT_ORIGIN_PATH"

if [ "$CURRENT_ORIGIN_PATH" = "/media" ]; then
  echo "✓ Origin Path is already set to /media"
  echo "No changes needed."
  exit 0
fi

echo ""
echo "Updating Origin Path to /media..."

# Update Origin Path
UPDATED_CONFIG=$(echo "$DIST_CONFIG" | jq \
  '.DistributionConfig.Origins.Items[0].OriginPath = "/media"')

# Save to temp file
echo "$UPDATED_CONFIG" | jq '.DistributionConfig' > /tmp/dist-config.json

# Update distribution
aws cloudfront update-distribution \
  --id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --distribution-config file:///tmp/dist-config.json \
  --if-match "$ETAG"

echo "✓ CloudFront distribution updated"
echo ""
echo "Origin Path changed from '$CURRENT_ORIGIN_PATH' to '/media'"
echo ""
echo "⏳ The distribution is now deploying (this takes 5-15 minutes)"
echo ""
echo "After deployment completes:"
echo "1. Wait for CloudFront status to show 'Deployed' in AWS console"
echo "2. Clear your browser cache or use incognito mode"
echo "3. Access your site - 403 errors should be resolved"
echo ""
echo "=== Fix Complete ==="
