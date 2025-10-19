/** @type {import('next').NextConfig} */
const nextConfig = {
  assetPrefix: process.env.NODE_ENV === 'production' ? '/media' : '',

  // Configure images for CDN
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.fakefourrecords.com',
        port: '',
        pathname: '/**',
      },
    ],
  },

  // Output configuration
  output: 'standalone',
  trailingSlash: true,

  // Optimize for production
  compress: true,

  // Security: Limit body size to prevent DoS
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  // Configure headers
  async headers() {
    // Build Content-Security-Policy based on environment
    const cspParts = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://challenges.cloudflare.com",
      "frame-src 'self' https://challenges.cloudflare.com",
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
      // Add any custom rewrites here
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
};

module.exports = nextConfig;
