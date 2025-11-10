/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use full CDN URL for all static assets in production
  // This eliminates the need for NGINX redirects and avoids 301 caching issues
  assetPrefix: process.env.NODE_ENV === 'production' ? 'https://cdn.fakefourrecords.com/media' : '',
  devIndicators: false,

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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://cdn.fakefourrecords.com",
      "style-src 'self' 'unsafe-inline' https://cdn.fakefourrecords.com",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data: https://cdn.fakefourrecords.com",
      "connect-src 'self' https://challenges.cloudflare.com https://cdn.fakefourrecords.com",
      "frame-src 'self' https://challenges.cloudflare.com",
      "worker-src 'self' blob:",
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
