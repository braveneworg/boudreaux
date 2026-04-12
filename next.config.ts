import type { NextConfig } from 'next';

const config = {
  // Use full CDN URL for all static assets in production
  // This eliminates the need for NGINX redirects and avoids 301 caching issues
  // Skip CDN prefix for E2E builds so assets are served locally
  assetPrefix:
    process.env.NODE_ENV === 'production' && !process.env.SKIP_CDN_ASSET_PREFIX
      ? 'https://cdn.fakefourrecords.com'
      : undefined,
  devIndicators: false,

  // Configure images for CDN
  images: {
    // Reduce default max device size from 3840 to 1920 for better performance
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    // Cache optimized images for 1 day (default is 60s) — images rarely change
    minimumCacheTTL: 86400,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.fakefourrecords.com',
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
    optimizePackageImports: ['lucide-react', 'date-fns', 'react-share', 'recharts'],
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },

  // Configure headers
  async headers() {
    // Build Content-Security-Policy based on environment
    // NOTE: 'unsafe-eval' is required by Stripe.js for its iframe-based payment elements.
    // A nonce-based CSP should replace 'unsafe-eval' and 'unsafe-inline' in a future PR.
    const cspParts = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://cdn.fakefourrecords.com https://js.stripe.com",
      "style-src 'self' 'unsafe-inline' https://cdn.fakefourrecords.com",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data: https://cdn.fakefourrecords.com",
      // Allow S3 direct uploads - explicit bucket URL + wildcard for any *.amazonaws.com subdomain
      "frame-src 'self' https://challenges.cloudflare.com https://js.stripe.com https://hooks.stripe.com",
      "worker-src 'self' blob:",
      // Allow fetch to Stripe API (server actions use fetch; Stripe.js connects to api.stripe.com)
      "connect-src 'self' https://api.stripe.com https://maps.googleapis.com https://cdn.fakefourrecords.com",
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
      // Favicon — rarely changes; 1-day cache + 7-day SWR
      {
        source: '/favicon.ico',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
      // Media assets proxied from CDN — content-addressed, safe to cache forever
      {
        source: '/media/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
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
      // Serve /media/* assets from CDN so they resolve without a /public/media directory
      {
        source: '/media/:path*',
        destination: 'https://cdn.fakefourrecords.com/media/:path*',
      },
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
} satisfies NextConfig;

export default config;
