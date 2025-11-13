#!/bin/bash
set -e

echo "=== Detailed Deployment Verification ==="
echo ""

# Check S3 webpack chunk
echo "1. S3 Build State:"
S3_WEBPACK=$(aws s3 ls s3://fakefourmedia/media/_next/static/chunks/ --recursive | grep webpack- | tail -1)
S3_WEBPACK_FILE=$(echo "$S3_WEBPACK" | awk '{print $4}' | xargs basename)
S3_WEBPACK_TIME=$(echo "$S3_WEBPACK" | awk '{print $1, $2}')
echo "   File: $S3_WEBPACK_FILE"
echo "   Updated: $S3_WEBPACK_TIME"
echo ""

# Check live HTML
echo "2. Live Container State:"
HTML_WEBPACK=$(curl -s https://fakefourrecords.com/ | grep -o '_next/static/chunks/webpack-[^"]*\.js' | head -1 | xargs basename)
echo "   File: $HTML_WEBPACK"
echo ""

# Try to extract BUILD_ID from HTML
echo "3. BUILD_ID Check:"
BUILD_ID_FROM_HTML=$(curl -s https://fakefourrecords.com/ | grep -o '"b":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$BUILD_ID_FROM_HTML" ]; then
  echo "   HTML BUILD_ID: $BUILD_ID_FROM_HTML"
else
  echo "   ⚠️  Could not extract BUILD_ID from HTML"
fi
echo ""

# Check if webpack files match
echo "4. Consistency Check:"
if [ "$S3_WEBPACK_FILE" = "$HTML_WEBPACK" ]; then
  echo "   ✅ MATCH: Containers and S3 are in sync"
  echo "   No 403 errors expected"
else
  echo "   ❌ MISMATCH: Containers are out of sync with S3"
  echo "   S3:        $S3_WEBPACK_FILE (updated $S3_WEBPACK_TIME)"
  echo "   Container: $HTML_WEBPACK"
  echo ""
  echo "   This means the Docker containers have NOT been updated"
  echo "   Check GitHub Actions for deployment status"
fi
echo ""

# Test actual access to problem files
echo "5. Testing Problem Files:"
TEST_FILES=(
  "817-6239f482aa536b03.js"
  "518-eb8c432ce8c4b34b.js"
)

for file in "${TEST_FILES[@]}"; do
  URL="https://cdn.fakefourrecords.com/media/_next/static/chunks/$file"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
  if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ $file - HTTP $HTTP_CODE"
  elif [ "$HTTP_CODE" = "403" ]; then
    echo "   ❌ $file - HTTP $HTTP_CODE (FORBIDDEN)"
  elif [ "$HTTP_CODE" = "404" ]; then
    echo "   ⚠️  $file - HTTP $HTTP_CODE (Not in current build)"
  else
    echo "   ❓ $file - HTTP $HTTP_CODE"
  fi
done
echo ""

# Check recent deployments
echo "6. Recent S3 Activity:"
echo "   Last 5 uploads:"
aws s3 ls s3://fakefourmedia/media/_next/static/chunks/ --recursive | tail -5 | while read -r line; do
  timestamp=$(echo "$line" | awk '{print $1, $2}')
  file=$(echo "$line" | awk '{print $4}' | xargs basename)
  echo "     $timestamp - $file"
done
echo ""

echo "=== Verification Complete ==="
