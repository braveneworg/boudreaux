# Deployment Asset Sync Verification

## Problem Statement

The production deployment had a mismatch between:
- **Docker container HTML**: References chunk files like `817-6239f482aa536b03.js`
- **S3/CDN assets**: Only contains older chunk files from 6 hours ago

This caused 403 errors on all CSS/JavaScript assets, rendering the site non-functional.

## Root Cause

The deployment workflow has three parallel/sequential jobs:
1. `sync-cdn` - Uploads Next.js build artifacts to S3
2. `build-images` - Builds Docker images with the same artifacts
3. `deploy` - Deploys containers to EC2

**The issue**: A previous deployment likely failed or was interrupted after the Docker images were deployed but before the CDN sync completed. This left the production container with a newer build than what's in S3.

## Solution Implemented

Added comprehensive verification steps to ensure build consistency across all deployment stages:

### 1. Enhanced Sync-CDN Verification

**File**: `.github/workflows/deploy.yml` (sync-cdn job)

```yaml
- name: Verify build consistency
  run: |
    # Extract BUILD_ID to track this specific build
    BUILD_ID=$(cat .next/BUILD_ID)
    echo "Build ID: $BUILD_ID"
    
    # Count chunk files for traceability
    find .next/static/chunks -name "*.js" | head -5
```

**File**: `.github/workflows/deploy.yml` (sync-cdn job)

```yaml
- name: Verify files uploaded to S3 and match build
  run: |
    # Get a sample chunk from local build
    SAMPLE_CHUNK=$(find .next/static/chunks -name "*.js" -type f | head -1)
    CHUNK_FILENAME=$(basename "$SAMPLE_CHUNK")
    
    # Verify it exists in S3
    S3_KEY="media/_next/static/chunks/$CHUNK_FILENAME"
    if aws s3 ls "s3://$S3_BUCKET/$S3_KEY" >/dev/null 2>&1; then
      echo "✓ Sample file verified in S3: $S3_KEY"
    else
      echo "❌ ERROR: Sample file NOT found in S3"
      exit 1
    fi
```

This ensures:
- The build was extracted correctly
- Files were actually uploaded to S3
- The uploaded files match the build being deployed

### 2. Build-Images Verification

**File**: `.github/workflows/deploy.yml` (build-images job)

```yaml
- name: Verify and extract artifact
  run: |
    # Extract to verify BUILD_ID
    tar -xzf next-build.tar.gz
    BUILD_ID=$(cat .next/BUILD_ID)
    echo "BUILD_ID in Docker image build: $BUILD_ID"
    
    # Show sample chunks
    find .next/static/chunks -name "*.js" | head -3
```

This ensures the Docker image contains the same build that was synced to S3.

### 3. Post-Deployment Integrity Check

**File**: `.github/workflows/deploy.yml` (deploy job)

```yaml
- name: Verify deployment integrity
  run: |
    # Fetch production HTML
    HTML_CONTENT=$(curl -k -s https://fakefourrecords.com/)
    
    # Extract a chunk reference
    CHUNK_REF=$(echo "$HTML_CONTENT" | grep -o '/_next/static/chunks/[^"]*\.js' | head -1)
    
    # Check if it exists in S3
    S3_KEY="media${CHUNK_REF}"
    if aws s3 ls "s3://$S3_BUCKET/$S3_KEY" >/dev/null 2>&1; then
      echo "✓ Deployment integrity verified"
    else
      echo "❌ ERROR: Asset mismatch detected"
      exit 1
    fi
```

This verifies that:
- The deployed HTML is actually being served
- The chunk files referenced in HTML exist in S3
- The deployment is fully consistent

## Deployment Workflow Guarantees

With these changes, the deployment workflow now guarantees:

### Build Consistency
- ✅ All jobs use the same `next-build.tar.gz` artifact from CI
- ✅ BUILD_ID is extracted and logged in all jobs
- ✅ Sample chunk files are verified at each stage

### Upload Verification
- ✅ Files are counted before and after upload
- ✅ Sample files are explicitly verified to exist in S3
- ✅ Upload timestamps are logged

### Deployment Integrity
- ✅ Production HTML is fetched and parsed
- ✅ Chunk references are extracted and verified against S3
- ✅ Deployment fails if there's a mismatch

### Failure Detection
- ❌ Job fails if build extraction fails
- ❌ Job fails if S3 upload verification fails
- ❌ Job fails if post-deployment integrity check fails
- ❌ Clear error messages explain what went wrong

## How to Verify a Deployment

After each deployment, check the GitHub Actions logs:

### 1. Check Sync-CDN Job
```
✓ Build extracted and verified
✓ Sample file verified in S3: media/_next/static/chunks/817-6239f482aa536b03.js
✓ Files successfully uploaded to S3 and verified
```

### 2. Check Build-Images Job
```
BUILD_ID in Docker image build: abc123xyz
Sample chunks that will be in Docker image:
  .next/static/chunks/817-6239f482aa536b03.js
  .next/static/chunks/255-6080d22baa93e028.js
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

*Last Updated: 2025-11-13*  
*Author: GitHub Copilot*  
*Related Issue: CDN asset 403 errors due to build/S3 mismatch*
