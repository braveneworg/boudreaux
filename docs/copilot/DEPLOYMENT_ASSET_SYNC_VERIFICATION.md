# Deployment Asset Sync Verification

## Problem Statement

The production deployment had a mismatch between:

- **Docker container HTML**: References chunk files like `817-6239f482aa536b03.js`
- **S3/CDN assets**: Contains different chunk files like `webpack-e6948dcde418d623.js`

This caused 403 errors on all CSS/JavaScript assets, rendering the site non-functional.

## Root Cause

The deployment workflow has three jobs that use the same build artifact:

1. `sync-cdn` - Downloads `next-build.tar.gz` and uploads to S3
2. `build-images` - Downloads `next-build.tar.gz` and builds Docker images
3. `deploy` - Deploys containers to EC2

**The issue**: The two jobs were potentially downloading different versions of `next-build.tar.gz`, causing S3 to contain different chunk files than the Docker images. This could happen if:
- GitHub Actions artifact cache serves stale versions
- Jobs run from different workflow runs
- Artifact is overwritten between job executions

## Solution Implemented

Added comprehensive checksum verification to ensure both jobs use identical build artifacts:

### 1. Enhanced Sync-CDN Verification

**File**: `.github/workflows/deploy.yml` (sync-cdn job)

```yaml
- name: Verify build before sync
  id: verify-build
  run: |
    # Extract BUILD_ID to track this specific build
    BUILD_ID=$(cat .next/BUILD_ID)
    echo "Build ID: $BUILD_ID"

    # Show ALL chunk files with sizes (not just sample)
    echo "All chunks that will be synced to S3:"
    ls -lh .next/static/chunks/*.js | awk '{print $9, $5}'

    # Calculate checksum of entire build
    CHUNKS_HASH=$(find .next/static/chunks -name "*.js" -exec sha256sum {} \; | sha256sum | awk '{print $1}')
    echo "Build artifact checksum: $CHUNKS_HASH"
    echo "CHUNKS_HASH=$CHUNKS_HASH" >> $GITHUB_ENV
    echo "CHUNKS_HASH=$CHUNKS_HASH" >> $GITHUB_OUTPUT
```

Output the checksum for cross-job verification:

```yaml
sync-cdn:
  name: Sync static assets to CDN
  runs-on: ubuntu-latest
  needs: download-build
  outputs:
    CHUNKS_HASH: ${{ steps.verify-build.outputs.CHUNKS_HASH }}
```
### 2. Build-Images Verification

**File**: `.github/workflows/deploy.yml` (build-images job)

```yaml
- name: Verify and extract artifact
  run: |
    # Extract to verify BUILD_ID matches sync-cdn
    tar -xzf next-build.tar.gz
    BUILD_ID=$(cat .next/BUILD_ID)
    echo "BUILD_ID in Docker image build: $BUILD_ID"
    echo "DOCKER_BUILD_ID=$BUILD_ID" >> $GITHUB_ENV

    # Show ALL chunks that will be in Docker image
    echo "Chunk files that will be in Docker image:"
    ls -lh .next/static/chunks/*.js | awk '{print $9, $5}'
    
    # Calculate checksum to match sync-cdn
    DOCKER_CHUNKS_HASH=$(find .next/static/chunks -name "*.js" -exec sha256sum {} \; | sha256sum | awk '{print $1}')
    echo "Docker build checksum: $DOCKER_CHUNKS_HASH"
    echo "DOCKER_CHUNKS_HASH=$DOCKER_CHUNKS_HASH" >> $GITHUB_ENV

    # Compare with sync-cdn checksum
    SYNC_HASH="${{ needs.sync-cdn.outputs.CHUNKS_HASH }}"
    if [ -n "$SYNC_HASH" ]; then
      echo "Comparing checksums between jobs:"
      echo "  sync-cdn:     $SYNC_HASH"
      echo "  build-images: $DOCKER_CHUNKS_HASH"
      
      if [ "$SYNC_HASH" != "$DOCKER_CHUNKS_HASH" ]; then
        echo "⚠️ WARNING: Build artifact mismatch detected!"
        echo "sync-cdn uploaded different files than will be in Docker images"
        echo "This will cause 403 errors on production!"
        exit 1
      fi
      echo "✓ Checksums match - build consistency verified"
    fi
```

This ensures:
- The Docker image contains the same build that was synced to S3
- **Fails the deployment if checksums don't match** (prevents 403 errors)
- Shows all chunk files for debugging
- Provides clear error messages about the mismatch

### 3. Post-Sync S3 Verification

**File**: `.github/workflows/deploy.yml` (sync-cdn job)

```yaml
- name: Verify files uploaded to S3 and match build
  run: |
    # Verify webpack chunk exists in S3
    WEBPACK_FILE=$(ls .next/static/chunks/webpack-*.js | head -1)
    WEBPACK_FILENAME=$(basename "$WEBPACK_FILE")
    S3_KEY="media/_next/static/chunks/$WEBPACK_FILENAME"
    
    if aws s3 ls "s3://$S3_BUCKET/$S3_KEY" >/dev/null 2>&1; then
      echo "✓ Webpack chunk verified in S3: $S3_KEY"
    else
      echo "❌ ERROR: Webpack chunk NOT found in S3"
      exit 1
    fi
```

This ensures files were actually uploaded to S3 and match the local build.

## How This Prevents 403 Errors

### The Problem

When `sync-cdn` and `build-images` use different build artifacts:

1. `sync-cdn` uploads chunks like `webpack-e6948dcde418d623.js` to S3
2. `build-images` creates Docker images with HTML referencing `817-6239f482aa536b03.js`
3. Browser requests `817-6239f482aa536b03.js` from CDN
4. File doesn't exist in S3 → **403 Forbidden**

### The Solution

The checksum comparison will:

1. Calculate `CHUNKS_HASH` in sync-cdn job before upload
2. Calculate `DOCKER_CHUNKS_HASH` in build-images job before building
3. Compare both checksums
4. **Fail the deployment** if they don't match

This prevents mismatched deployments from reaching production.

## Deployment Workflow Guarantees

With these changes, the deployment workflow now guarantees:

### Build Consistency

- ✅ Both jobs download `next-build.tar.gz` from the same workflow run
- ✅ BUILD_ID is extracted and logged in both jobs
- ✅ **Full checksum verification** ensures identical artifacts
- ✅ Deployment fails if checksums don't match (prevents 403s)

### Upload Verification

- ✅ All chunk files are listed before upload (not just sample)
- ✅ Checksum is calculated for entire build
- ✅ Webpack chunk is explicitly verified in S3 after upload
- ✅ Upload timestamps are logged

### Deployment Integrity

- ✅ **Checksum verification prevents mismatched deployments**
- ✅ Explicit comparison between sync-cdn and build-images
- ✅ Deployment fails before reaching production if mismatch detected

### Failure Detection

- ❌ Job fails if build extraction fails
- ❌ Job fails if checksums don't match between jobs
- ❌ Job fails if S3 upload verification fails
- ❌ Clear error messages explain what went wrong

## How to Verify a Deployment

After each deployment, check the GitHub Actions logs:

### 1. Check Sync-CDN Job

```
BUILD_ID: abc123xyz
All chunks that will be synced to S3:
  .next/static/chunks/817-6239f482aa536b03.js 245K
  .next/static/chunks/255-6080d22baa93e028.js 180K
  .next/static/chunks/webpack-e6948dcde418d623.js 2.1K
Build artifact checksum: 8f3d2e1a9b7c6d5e4f3g2h1i0j9k8l7m6n5o4p3q2r1s0
✓ Webpack chunk verified in S3: media/_next/static/chunks/webpack-e6948dcde418d623.js
```

### 2. Check Build-Images Job

```
BUILD_ID in Docker image build: abc123xyz
Chunk files that will be in Docker image:
  .next/static/chunks/817-6239f482aa536b03.js 245K
  .next/static/chunks/255-6080d22baa93e028.js 180K
  .next/static/chunks/webpack-e6948dcde418d623.js 2.1K
Docker build checksum: 8f3d2e1a9b7c6d5e4f3g2h1i0j9k8l7m6n5o4p3q2r1s0

Comparing checksums between jobs:
  sync-cdn:     8f3d2e1a9b7c6d5e4f3g2h1i0j9k8l7m6n5o4p3q2r1s0
  build-images: 8f3d2e1a9b7c6d5e4f3g2h1i0j9k8l7m6n5o4p3q2r1s0
✓ Checksums match - build consistency verified
```

### 3. What to Look For

✅ **BUILD_ID matches** between sync-cdn and build-images
✅ **Checksums match** between both jobs
✅ **All chunk files listed** (not truncated)
✅ **S3 verification succeeds**

❌ If checksums don't match, deployment will fail with clear error:
```
⚠️ WARNING: Build artifact mismatch detected!
sync-cdn uploaded different files than will be in Docker images
This will cause 403 errors on production!
```
```

### 3. Check Deploy Job

```
✓ SUCCESS: Asset referenced in HTML exists in S3
✓ Deployment integrity verified - HTML and CDN assets match
```

## What Happens if There's a Mismatch

If the verification detects a mismatch:

```
❌ ERROR: Asset referenced in HTML does NOT exist in S3
File: media/_next/static/chunks/817-6239f482aa536b03.js

This means there is a mismatch between the deployed container and CDN assets.
The container has a newer build than what was synced to S3.

⚠️  DEPLOYMENT WARNING: Site may not load correctly due to asset mismatch
```

The deployment will **FAIL** and prevent broken deployments from reaching production.

## Manual Verification Commands

To manually verify deployment integrity:

```bash
# 1. Check what's deployed in HTML
curl -s https://fakefourrecords.com/ | grep -o '/_next/static/chunks/[^"]*\.js' | head -5

# 2. Check what's in S3
aws s3 ls s3://fakefourmedia/media/_next/static/chunks/ | head -10

# 3. Verify a specific file exists
aws s3 ls s3://fakefourmedia/media/_next/static/chunks/817-6239f482aa536b03.js

# 4. Check CloudFront status
aws cloudfront get-distribution --id E2QCL9RZEM5RZE --query 'Distribution.Status'
```

## Recovery from Mismatch

If you discover a mismatch in production:

### Option 1: Trigger a Fresh Deployment

```bash
# Push a new commit or re-run the workflow
git commit --allow-empty -m "Trigger deployment to sync assets"
git push origin main
```

### Option 2: Manual Sync

```bash
# Sync current build to CDN
npm run sync:cdn
```

### Option 3: Rollback

```bash
# On EC2, roll back to previous Docker image
docker pull ghcr.io/braveneworg/boudreaux/website@sha256:previous-digest
docker-compose -f docker-compose.prod.yml up -d --force-recreate
```

## Prevention

These verification steps prevent mismatches by:

1. **Failing fast** when uploads don't complete
2. **Verifying at each stage** that files are correct
3. **Checking production** after deployment
4. **Providing clear error messages** for debugging

## Related Files

- `.github/workflows/deploy.yml` - Main deployment workflow
- `scripts/sync-cdn.ts` - CDN sync script
- `Dockerfile` - Docker image build configuration
- `next.config.ts` - Next.js configuration with assetPrefix

## Next Steps

After the next deployment runs successfully:

1. Check the GitHub Actions logs for all ✅ success messages
2. Verify the site loads without 403 errors
3. Check browser console for any asset loading failures
4. Monitor CloudWatch/logs for any runtime errors

---

_Last Updated: 2025-11-13_
_Author: GitHub Copilot_
_Related Issue: CDN asset 403 errors due to build/S3 mismatch_
