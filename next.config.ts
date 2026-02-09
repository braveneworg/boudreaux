import type { NextConfig } from 'next';

// CDN domain configuration - can be overridden via environment variable
const CDN_DOMAIN = process.env.NEXT_PUBLIC_CDN_DOMAIN || 'https://cdn.fakefourrecords.com';
const CDN_HOSTNAME = new URL(CDN_DOMAIN).hostname;

const config = {
  // Use full CDN URL for all static assets in production
  // This eliminates the need for NGINX redirects and avoids 301 caching issues
  assetPrefix: process.env.NODE_ENV === 'production' ? `${CDN_DOMAIN}/media` : '',
  devIndicators: false,

  // Configure images for CDN
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: CDN_HOSTNAME,
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Empty turbopack config to allow Turbopack builds (Next.js 16+ default)
  // while keeping webpack config for compatibility
  turbopack: {},
  webpack: (config: { module: { rules: unknown[] } }, { isServer }: { isServer: boolean }) => {
    // Handle Video.js worker files
    if (!isServer) {
      config.module.rules.push({
        test: /\.worker\.js$/,
        use: { loader: 'worker-loader' },
      });
    }
    return config;
  },
  // Output configuration
  output: 'standalone',
  // NOTE: trailingSlash set to false because Auth.js API routes don't work with trailing slashes
  // Auth.js expects /api/auth/session, not /api/auth/session/
  trailingSlash: false,

  // Optimize for production
  compress: true,

  // Body size limits
  // Note: For API routes like /api/tracks/metadata that need larger uploads,
  // the nginx config has location-specific client_max_body_size settings.
  // For local development, Next.js uses Node.js defaults which should handle larger files.
  experimental: {
    serverActions: {
      bodySizeLimit: '2048mb', // probably suitable for uploading up to 100 320 Kbps tracks, but can be adjusted as needed
    },
  },

  // Configure headers
  async headers() {
    // Build Content-Security-Policy based on environment
    const cspParts = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://cdn.fakefourrecords.com",
      "style-src 'self' 'unsafe-inline' https://cdn.fakefourrecords.com",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data: https://cdn.fakefourrecords.com",
      // Allow S3 direct uploads - explicit bucket URL + wildcard for any *.amazonaws.com subdomain
      "connect-src 'self' https://challenges.cloudflare.com https://cdn.fakefourrecords.com https://fakefourmedia.s3.us-east-1.amazonaws.com https://*.amazonaws.com",
      "frame-src 'self' https://challenges.cloudflare.com",
      "worker-src 'self' blob:",
      // Allow media from CDN and S3, plus blob: for local playback
      "media-src 'self' https: blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ];

    // Only upgrade insecure requests in production
    if (process.env.NODE_ENV === 'production') {
      cspParts.push('upgrade-insecure-requests');
    }

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: cspParts.join('; '),
          },
        ],
      },
    ];
  },

  // Configure rewrites if needed
  async rewrites() {
    return [
      {
        source: '/signin',
        destination: '/signup',
      },
      {
        source: '/success/signin',
        has: [
          {
            type: 'query',
            key: 'email',
          },
        ],
        destination: '/success/signup?email=:email*',
      },
    ];
  },

  // Redirect /media/* to CDN for any old links or direct access attempts
  async redirects() {
    return [
      {
        source: '/media/:path*',
        destination: `${CDN_DOMAIN}/media/:path*`,
        permanent: false,
        statusCode: 301,
      },
    ];
  },
} satisfies NextConfig;

export default config;
