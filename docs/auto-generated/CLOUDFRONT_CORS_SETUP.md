# CloudFront CORS Configuration Guide

## Problem

When using `assetPrefix` to serve Next.js static files (JS, CSS) from CloudFront CDN, browsers block the resources with CORB (Cross-Origin Read Blocking) errors because CloudFront doesn't send proper CORS headers.

## Current Solution

We've removed `assetPrefix` and commented out the NGINX redirect for `/_next/static/` files. This means:

- ✅ Next.js static files (JS, CSS, fonts) are served from your domain (no CORS issues)
- ✅ Media files (images, videos) are still served from CDN
- ⚠️ Static files aren't cached globally (only images are on CDN)

## Long-term Solution: Configure CloudFront CORS

To serve ALL assets from CDN (including Next.js static files), you need to configure CloudFront to send CORS headers.

### Step 1: Create a Response Headers Policy

1. Go to CloudFront Console: https://console.aws.amazon.com/cloudfront/v3/home
2. Click **Policies** in the left sidebar
3. Click **Response headers** tab
4. Click **Create policy**
5. Configure:
   - **Name**: `NextJS-CORS-Policy`
   - **CORS Configuration**:
     - Enable CORS: ✅
     - Access-Control-Allow-Origin: `https://www.fakefourrecords.com` and `https://fakefourrecords.com`
     - Access-Control-Allow-Methods: `GET, HEAD, OPTIONS`
     - Access-Control-Allow-Headers: `*`
     - Access-Control-Max-Age: `86400`
     - Access-Control-Allow-Credentials: ❌ (unchecked)
   - **Custom Headers** (add these):
     - `X-Content-Type-Options`: `nosniff`
     - `X-Frame-Options`: `DENY`
     - `X-XSS-Protection`: `1; mode=block`

6. Click **Create**

### Step 2: Attach Policy to CloudFront Distribution

1. Go to your CloudFront distribution (`E2QCL9RZEM5RZE`)
2. Click the **Behaviors** tab
3. Select the **Default (\*)** behavior
4. Click **Edit**
5. Scroll to **Response headers policy**
6. Select your new policy: `NextJS-CORS-Policy`
7. Click **Save changes**

### Step 3: Wait for Deployment

CloudFront changes take 5-15 minutes to propagate globally.

### Step 4: Test CORS Headers

```bash
curl -I https://cdn.fakefourrecords.com/media/_next/static/chunks/main.js
```

You should see:

```
access-control-allow-origin: https://www.fakefourrecords.com
access-control-allow-methods: GET, HEAD, OPTIONS
```

### Step 5: Re-enable assetPrefix

Once CORS is configured, update `next.config.ts`:

```typescript
const nextConfig = {
  assetPrefix: process.env.NODE_ENV === 'production' ? '/media' : '',
  // ...
};
```

And uncomment NGINX redirect:

```nginx
# Static files served from CDN
location /_next/static/ {
    return 301 https://cdn.fakefourrecords.com$request_uri;
}
```

## Alternative: Use CloudFront Origin Access Identity (OAI)

For more security, you can configure CloudFront to access S3 directly without making the bucket public:

1. Create an Origin Access Identity (OAI)
2. Update S3 bucket policy to only allow CloudFront OAI
3. CloudFront will sign requests to S3
4. Still need CORS headers policy as above

This prevents direct S3 access and forces all traffic through CloudFront.

## Benefits of CDN for Static Assets

- ⚡ Faster load times (global edge locations)
- 💰 Reduced bandwidth costs
- 📈 Better scalability
- 🌍 Lower latency for international users

## Current Trade-offs

Without `assetPrefix`:

- Static files (JS, CSS) served from your EC2 instance
- More load on your server
- Higher bandwidth usage
- But: No CORS issues, simpler setup

With CDN properly configured:

- All assets served globally
- Minimal server load
- But: Requires CloudFront CORS setup
