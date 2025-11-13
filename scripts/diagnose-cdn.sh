#!/bin/bash

# Diagnostic script to check CloudFront and S3 configuration
# Run with: bash scripts/diagnose-cdn.sh

set -e

echo "=== CloudFront and S3 Diagnostic Tool ==="
echo ""

# Load environment variables
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Check required environment variables
if [ -z "$S3_BUCKET" ] || [ -z "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
  echo "Error: S3_BUCKET and CLOUDFRONT_DISTRIBUTION_ID must be set in .env"
  exit 1
fi

echo "S3 Bucket: $S3_BUCKET"
echo "CloudFront Distribution: $CLOUDFRONT_DISTRIBUTION_ID"
echo ""

# 1. Check if files exist in S3
echo "1. Checking S3 for uploaded files..."
FILE_COUNT=$(aws s3 ls "s3://$S3_BUCKET/media/_next/static/" --recursive 2>/dev/null | wc -l || echo "0")
echo "   Found $FILE_COUNT files in s3://$S3_BUCKET/media/_next/static/"

if [ "$FILE_COUNT" -eq 0 ]; then
  echo "   ❌ No files found! Files may not have been uploaded."
else
  echo "   ✓ Files exist in S3"
  echo "   Sample files:"
  aws s3 ls "s3://$S3_BUCKET/media/_next/static/chunks/" --recursive 2>/dev/null | head -5 || true
fi
echo ""

# 2. Check S3 bucket policy
echo "2. Checking S3 bucket policy..."
POLICY=$(aws s3api get-bucket-policy --bucket "$S3_BUCKET" --query Policy --output text 2>/dev/null || echo "")
if [ -z "$POLICY" ]; then
  echo "   ❌ No bucket policy found!"
else
  if echo "$POLICY" | grep -q "cloudfront.amazonaws.com"; then
    echo "   ✓ Bucket policy allows CloudFront service principal"
  else
    echo "   ❌ Bucket policy does not allow CloudFront!"
    echo "$POLICY" | jq '.' 2>/dev/null || echo "$POLICY"
  fi
fi
echo ""

# 3. Check CloudFront distribution configuration
echo "3. Checking CloudFront distribution configuration..."

# Get origin domain
ORIGIN_DOMAIN=$(aws cloudfront get-distribution \
  --id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --query 'Distribution.DistributionConfig.Origins.Items[0].DomainName' \
  --output text 2>/dev/null || echo "")

echo "   Origin Domain: $ORIGIN_DOMAIN"

# Get origin path
ORIGIN_PATH=$(aws cloudfront get-distribution \
  --id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --query 'Distribution.DistributionConfig.Origins.Items[0].OriginPath' \
  --output text 2>/dev/null || echo "")

if [ "$ORIGIN_PATH" = "None" ] || [ -z "$ORIGIN_PATH" ]; then
  echo "   Origin Path: / (root)"
  echo "   ⚠️  WARNING: Origin path is root, but files are uploaded to /media/"
  echo "   This is the likely cause of 403 errors!"
else
  echo "   Origin Path: $ORIGIN_PATH"
fi

# Check OAC
OAC_ID=$(aws cloudfront get-distribution \
  --id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --query 'Distribution.DistributionConfig.Origins.Items[0].OriginAccessControlId' \
  --output text 2>/dev/null || echo "")

if [ "$OAC_ID" = "None" ] || [ -z "$OAC_ID" ]; then
  echo "   ❌ Origin Access Control (OAC) is NOT configured!"
  echo "   This will cause 403 errors."
else
  echo "   ✓ OAC configured: $OAC_ID"
fi
echo ""

# 4. Test actual file access
echo "4. Testing file access..."
TEST_URL="https://cdn.fakefourrecords.com/media/_next/static/css"
echo "   Testing: $TEST_URL"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$TEST_URL" || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✓ Files are accessible (HTTP $HTTP_CODE)"
elif [ "$HTTP_CODE" = "403" ]; then
  echo "   ❌ Got 403 Forbidden"
  echo "   Likely causes:"
  echo "   - OAC not configured on CloudFront"
  echo "   - Origin path mismatch (CloudFront looking at root, files at /media/)"
  echo "   - S3 bucket policy not allowing CloudFront"
else
  echo "   ❌ Got HTTP $HTTP_CODE"
fi
echo ""

# 5. Recommended fixes
echo "=== Recommended Fixes ==="
echo ""

if [ -z "$OAC_ID" ] || [ "$OAC_ID" = "None" ]; then
  echo "1. Configure Origin Access Control (OAC):"
  echo "   - The workflow should do this automatically"
  echo "   - Or manually create OAC in CloudFront console"
  echo ""
fi

if [ -z "$ORIGIN_PATH" ] || [ "$ORIGIN_PATH" = "None" ]; then
  echo "2. Fix Origin Path mismatch:"
  echo "   Option A: Set CloudFront Origin Path to '/media'"
  echo "   Option B: Upload files to S3 root instead of /media/ prefix"
  echo ""
  echo "   To fix via AWS CLI:"
  echo "   aws cloudfront get-distribution-config --id $CLOUDFRONT_DISTRIBUTION_ID > dist-config.json"
  echo "   # Edit dist-config.json to set Origins.Items[0].OriginPath to '/media'"
  echo "   # Then update distribution with the modified config"
  echo ""
fi

echo "=== End of Diagnostic ==="
