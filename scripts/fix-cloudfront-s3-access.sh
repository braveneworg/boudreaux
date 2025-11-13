#!/bin/bash
set -e

# Fix CloudFront OAC and S3 bucket policy for CDN access
# This script ensures CloudFront can access S3 via Origin Access Control

DISTRIBUTION_ID="E2QCL9RZEM5RZE"
S3_BUCKET="fakefourmedia"
OAC_ID="E1G7RN6XRYIOPK"

echo "=== Fixing CloudFront OAC and S3 Access ==="
echo ""

# Step 1: Verify CloudFront OAC is attached
echo "1. Checking CloudFront OAC configuration..."
CURRENT_OAC=$(aws cloudfront get-distribution \
  --id "$DISTRIBUTION_ID" \
  --query 'Distribution.DistributionConfig.Origins.Items[0].OriginAccessControlId' \
  --output text 2>/dev/null || echo "None")

if [ "$CURRENT_OAC" = "None" ] || [ -z "$CURRENT_OAC" ]; then
  echo "   ⚠️  OAC not attached to distribution"
  echo "   You need to manually attach OAC $OAC_ID to origin in CloudFront console"
  echo "   https://console.aws.amazon.com/cloudfront/v4/home#/distributions/$DISTRIBUTION_ID"
else
  echo "   ✅ OAC attached: $CURRENT_OAC"
fi
echo ""

# Step 2: Get distribution ARN for bucket policy
echo "2. Getting CloudFront distribution ARN..."
DISTRIBUTION_ARN="arn:aws:cloudfront::$(aws sts get-caller-identity --query Account --output text):distribution/$DISTRIBUTION_ID"
echo "   Distribution ARN: $DISTRIBUTION_ARN"
echo ""

# Step 3: Create/update S3 bucket policy
echo "3. Creating S3 bucket policy for CloudFront OAC..."
cat > /tmp/bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipal",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${S3_BUCKET}/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "${DISTRIBUTION_ARN}"
        }
      }
    }
  ]
}
EOF

echo "   Bucket policy created:"
cat /tmp/bucket-policy.json
echo ""

# Step 4: Apply bucket policy
echo "4. Applying bucket policy to S3..."
if aws s3api put-bucket-policy --bucket "$S3_BUCKET" --policy file:///tmp/bucket-policy.json; then
  echo "   ✅ Bucket policy applied successfully"
else
  echo "   ❌ Failed to apply bucket policy"
  exit 1
fi
echo ""

# Step 5: Verify bucket policy was applied
echo "5. Verifying bucket policy..."
APPLIED_POLICY=$(aws s3api get-bucket-policy --bucket "$S3_BUCKET" --query Policy --output text 2>/dev/null || echo "None")
if [ "$APPLIED_POLICY" != "None" ]; then
  echo "   ✅ Bucket policy is active"
  echo "$APPLIED_POLICY" | jq '.'
else
  echo "   ⚠️  Could not verify bucket policy"
fi
echo ""

# Step 6: Test CloudFront access
echo "6. Testing CloudFront CDN access..."
TEST_URL="https://cdn.fakefourrecords.com/media/_next/static/chunks/518-eb8c432ce8c4b34b.js"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$TEST_URL" || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ CDN access working! HTTP 200"
elif [ "$HTTP_CODE" = "403" ]; then
  echo "   ❌ Still getting 403 - check these:"
  echo "      - Verify OAC is attached in CloudFront console"
  echo "      - Wait 5-10 minutes for CloudFront to propagate changes"
  echo "      - Check if file actually exists in S3"
elif [ "$HTTP_CODE" = "404" ]; then
  echo "   ⚠️  File not found (404) - might not be uploaded to S3 yet"
else
  echo "   ⚠️  Unexpected HTTP code: $HTTP_CODE"
fi
echo ""

# Step 7: Check if file exists in S3
echo "7. Checking if file exists in S3..."
if aws s3 ls "s3://$S3_BUCKET/media/_next/static/chunks/518-eb8c432ce8c4b34b.js" >/dev/null 2>&1; then
  echo "   ✅ File exists in S3"
else
  echo "   ❌ File does NOT exist in S3"
  echo "   This chunk is from a build that wasn't synced to S3"
  echo "   Run: npm run sync:cdn"
fi
echo ""

# Cleanup
rm -f /tmp/bucket-policy.json

echo "=== Fix Complete ==="
echo ""
echo "Next steps:"
echo "1. If OAC not attached, manually attach it in CloudFront console"
echo "2. Wait 5-10 minutes for CloudFront to propagate policy changes"
echo "3. If file doesn't exist, deploy to sync latest build to S3"
echo "4. Test again with: curl -I $TEST_URL"
