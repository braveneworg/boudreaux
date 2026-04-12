# Caching Infrastructure Checklist

Items from the [Caching Strategy PRD](../../prds/CACHING_STRATEGY.md) that require AWS infrastructure configuration (not application code). Apply via AWS Console, CloudFormation, Terraform, or CDK.

## CloudFront Cache Behaviors

Configure separate behaviors ordered by priority (more specific patterns first):

| Priority | Path Pattern      | Origin | Cache Policy   | Compress | Notes                             |
| -------- | ----------------- | ------ | -------------- | -------- | --------------------------------- |
| 1        | `/audio/*`        | S3     | Long TTL (1yr) | **No**   | Audio is already compressed       |
| 2        | `/images/*`       | S3     | Long TTL (1yr) | Yes      | WebP/PNG benefit from gzip/brotli |
| 3        | `/_next/static/*` | EC2/S3 | Long TTL (1yr) | Yes      | Content-hashed by Next.js         |
| 4        | `/_next/image*`   | EC2    | Medium (1 day) | Yes      | Optimized images via Next.js      |
| 5        | `/*` (default)    | EC2    | Short/no-cache | Yes      | HTML pages, API routes            |

## CloudFront Cache Policy Settings

### Long TTL policy (audio, images, `_next/static`)

- Minimum TTL: 86400 (1 day)
- Default TTL: 31536000 (1 year)
- Maximum TTL: 31536000 (1 year)
- Query strings: **None** (prevents cache key bloat)
- Headers: Whitelist only `Origin` (for CORS)
- Cookies: **None**

### Short TTL / no-cache policy (HTML, API)

- Minimum TTL: 0
- Default TTL: 0
- Maximum TTL: 3600 (1 hour max)
- Query strings: All (needed for API routes)
- Headers: All or whitelist as needed
- Cookies: All (needed for Auth.js)

## S3 Bucket CORS Configuration

Required for cross-origin audio playback and image loading:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": [
      "https://fakefourrecords.com",
      "https://www.fakefourrecords.com",
      "http://localhost:3000"
    ],
    "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 86400
  }
]
```

## Compression Toggles

- **Disable** compression on audio behaviors (MP3, FLAC, etc. are already compressed)
- **Enable** compression on image, JS/CSS, and HTML behaviors

## Optional: CloudFront Functions

Fallback for enforcing cache headers if S3 metadata isn't flowing through:

### Viewer-response on audio/image behaviors

```javascript
function handler(event) {
  var response = event.response;
  response.headers['cache-control'] = {
    value: 'public, max-age=31536000, immutable',
  };
  return response;
}
```

### Viewer-response on default behavior (HTML)

```javascript
function handler(event) {
  var response = event.response;
  response.headers['cache-control'] = {
    value: 'public, max-age=0, must-revalidate',
  };
  return response;
}
```

## Verification

Test with:

```bash
curl -I https://cdn.fakefourrecords.com/audio/some-track.mp3
# Expect: Cache-Control: public, max-age=31536000, immutable
# Expect: x-cache: Hit from cloudfront (on subsequent requests)

curl -I https://cdn.fakefourrecords.com/media/artists/some-image.webp
# Expect: Cache-Control: public, max-age=31536000, immutable
```
