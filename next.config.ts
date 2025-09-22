/** @type {import('next').NextConfig} */
const nextConfig = {
  assetPrefix: process.env.NODE_ENV === 'production'
    ? process.env.NEXT_APP_CDN_DOMAIN
    : process.env.NEXT_APP_CDN_DOMAIN || 'boogers',

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

  // Configure headers
  async headers() {
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
        ],
      },
    ]
  },

  // Configure rewrites if needed
  async rewrites() {
    return [
      // Add any custom rewrites here
    ]
  },
}

module.exports = nextConfig
