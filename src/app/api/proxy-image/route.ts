import { type NextRequest, NextResponse } from 'next/server';

/**
 * Proxy endpoint to fetch remote images and return them as blobs.
 * This helps bypass CORS issues when loading images from S3/CloudFront
 * for use in the image cropper.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
  }

  // Validate that the URL is from our allowed domains (S3/CloudFront/custom CDN)
  const allowedDomains = [
    'cloudfront.net',
    's3.amazonaws.com',
    's3.us-east-1.amazonaws.com',
    's3.us-west-2.amazonaws.com',
    'fakefourrecords.com', // Custom CDN domain
  ];

  // Also allow the CDN_DOMAIN from environment if set
  const cdnDomain = process.env.CDN_DOMAIN;
  if (cdnDomain) {
    try {
      const cdnUrl = new URL(cdnDomain);
      allowedDomains.push(cdnUrl.hostname);
    } catch {
      // Invalid CDN_DOMAIN, skip
    }
  }

  try {
    const parsedUrl = new URL(url);
    const isAllowed = allowedDomains.some((domain) => parsedUrl.hostname.endsWith(domain));

    if (!isAllowed) {
      console.warn('[proxy-image] Blocked request to non-allowed domain:', parsedUrl.hostname);
      return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
    }

    const response = await fetch(url, {
      headers: {
        // Pass through common headers that might be needed
        Accept: 'image/*',
      },
    });

    if (!response.ok) {
      console.error('[proxy-image] Failed to fetch image:', response.status, response.statusText);
      return NextResponse.json(
        { error: `Failed to fetch image: ${response.statusText}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('[proxy-image] Error proxying image:', error);
    return NextResponse.json({ error: 'Failed to proxy image' }, { status: 500 });
  }
}
