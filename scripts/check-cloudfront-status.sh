#!/bin/bash

# Quick check of CloudFront distribution status

set -e

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

echo "Checking CloudFront distribution status..."
echo ""

STATUS=$(aws cloudfront get-distribution \
  --id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --query 'Distribution.Status' \
  --output text)

echo "Status: $STATUS"
echo ""

if [ "$STATUS" = "InProgress" ]; then
  echo "⏳ Distribution is still deploying"
  echo "This typically takes 10-15 minutes"
  echo ""
  echo "While it's deploying, assets may not load correctly."
  echo "Check again in a few minutes."
elif [ "$STATUS" = "Deployed" ]; then
  echo "✓ Distribution is deployed"
  echo ""
  echo "If assets still aren't loading:"
  echo "1. Clear your browser cache completely"
  echo "2. Try in incognito/private mode"
  echo "3. Check the actual URL being requested in browser DevTools Network tab"
fi

# Check origin configuration
ORIGIN_PATH=$(aws cloudfront get-distribution \
  --id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --query 'Distribution.DistributionConfig.Origins.Items[0].OriginPath' \
  --output text)

echo ""
echo "Current Origin Path: '$ORIGIN_PATH'"

if [ "$ORIGIN_PATH" != "" ] && [ "$ORIGIN_PATH" != "null" ]; then
  echo "⚠️  Origin Path should be empty (root) for correct asset resolution"
else
  echo "✓ Origin Path is correctly configured (root)"
fi
