#!/bin/bash
set -e

echo "=== Deployment Consistency Verification ==="
echo ""

# Check what's currently in S3
echo "1. Checking S3 webpack chunk..."
S3_WEBPACK=$(aws s3 ls s3://fakefourmedia/media/_next/static/chunks/ --recursive | grep webpack- | awk '{print $4}' | xargs basename)
if [ -n "$S3_WEBPACK" ]; then
  echo "   S3 webpack chunk: $S3_WEBPACK"
else
  echo "   ⚠️  No webpack chunk found in S3"
fi
echo ""

# Check what's in the live HTML
echo "2. Checking live HTML references..."
HTML_WEBPACK=$(curl -s https://fakefourrecords.com/ | grep -o '_next/static/chunks/webpack-[^"]*\.js' | head -1 | xargs basename)
if [ -n "$HTML_WEBPACK" ]; then
  echo "   HTML webpack chunk: $HTML_WEBPACK"
else
  echo "   ⚠️  No webpack chunk found in HTML"
fi
echo ""

# Compare
echo "3. Verification Result:"
if [ "$S3_WEBPACK" = "$HTML_WEBPACK" ]; then
  echo "   ✅ SUCCESS: S3 and HTML match!"
  echo "   No 403 errors expected"
else
  echo "   ❌ MISMATCH DETECTED!"
  echo "   S3:  $S3_WEBPACK"
  echo "   HTML: $HTML_WEBPACK"
  echo "   This will cause 403 errors"
fi
echo ""

# Show sample chunk files in S3
echo "4. Recent chunks in S3:"
aws s3 ls s3://fakefourmedia/media/_next/static/chunks/ --recursive | tail -5
echo ""

# Test actual file access
echo "5. Testing CDN access to webpack chunk..."
if [ -n "$S3_WEBPACK" ]; then
  CDN_URL="https://cdn.fakefourrecords.com/media/_next/static/chunks/$S3_WEBPACK"
  if curl -I -s -o /dev/null -w "%{http_code}" "$CDN_URL" | grep -q "200"; then
    echo "   ✅ Webpack chunk accessible: $CDN_URL"
  else
    HTTP_CODE=$(curl -I -s -o /dev/null -w "%{http_code}" "$CDN_URL")
    echo "   ❌ Webpack chunk returned HTTP $HTTP_CODE: $CDN_URL"
  fi
fi
echo ""

echo "=== Verification Complete ==="
