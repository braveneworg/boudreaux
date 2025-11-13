#!/bin/bash

# Revert CloudFront Origin Path back to root
# The real issue was OAC not being configured, which is now fixed

set -e

echo "=== Reverting CloudFront Origin Path to Root ==="
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

echo "Current Origin Path: '$CURRENT_ORIGIN_PATH'"

if [ "$CURRENT_ORIGIN_PATH" = "" ] || [ "$CURRENT_ORIGIN_PATH" = "null" ]; then
  echo "✓ Origin Path is already at root (empty)"
  echo "No changes needed."
  exit 0
fi

echo ""
echo "Reverting Origin Path to root (empty)..."
echo "This is correct because:"
echo "  - assetPrefix is: https://cdn.fakefourrecords.com/media"
echo "  - Files in S3 are at: s3://fakefourmedia/media/_next/..."
echo "  - With root origin path, CloudFront will correctly fetch from s3://fakefourmedia/media/..."
echo ""

# Update Origin Path to empty (root)
UPDATED_CONFIG=$(echo "$DIST_CONFIG" | jq \
  '.DistributionConfig.Origins.Items[0].OriginPath = ""')

# Save to temp file
echo "$UPDATED_CONFIG" | jq '.DistributionConfig' > /tmp/dist-config.json

# Update distribution
aws cloudfront update-distribution \
  --id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --distribution-config file:///tmp/dist-config.json \
  --if-match "$ETAG"

echo "✓ CloudFront distribution updated"
echo ""
echo "Origin Path changed from '$CURRENT_ORIGIN_PATH' to '' (root)"
echo ""
echo "⏳ The distribution is now deploying (this takes 5-15 minutes)"
echo ""
echo "After deployment completes:"
echo "1. Wait for CloudFront status to show 'Deployed' in AWS console"
echo "2. Clear your browser cache completely"
echo "3. Access your site - CSS/JS should now load correctly"
echo ""
echo "Note: Images were working because they use a different path structure."
echo ""
echo "=== Revert Complete ==="
