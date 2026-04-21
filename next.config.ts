import { IMAGE_VARIANT_DEVICE_SIZES } from './src/lib/constants/image-variants';

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

  // Configure images for direct CDN delivery.
  // Uses a global custom loader (`image-loader.ts`) so all <Image> components
  // produce direct CDN URLs instead of routing through /_next/image — which
  // does not exist on the CloudFront/S3 origin and would 403.
  images: {
    loader: 'custom',
    loaderFile: './src/lib/image-loader.ts',
    // Device sizes still inform srcset generation with custom loaders
    deviceSizes: [...IMAGE_VARIANT_DEVICE_SIZES],
    // Only allow SVG from our own CDN (we control the contents); block active
    // scripts inside optimized SVGs.
    dangerouslyAllowSVG: false,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.fakefourrecords.com',
        port: '',
        pathname: '/**',
      },
      // picsum.photos is used for placeholder/seed content only. It is a
      // third-party origin; if you do not use it in production, remove it.
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
  serverExternalPackages: ['node-id3'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', 'react-share', 'recharts'],
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },

  // Configure headers
  async headers() {
    // Build Content-Security-Policy based on environment.
    // Known widenings and why they remain:
    //   - 'unsafe-inline' on script-src/style-src: Next.js inlines small runtime
    //     scripts and CSS-in-JS. Moving to a nonce-based CSP requires wiring
    //     `headers()` into middleware so the nonce is per-request.
    //   - 'unsafe-eval' historically required by Stripe.js feature detection
    //     and Next.js HMR in dev. Keeping it behind an env flag so the value
    //     can be flipped off in production once verified in a staging soak.
    //     Default: allow in dev; require STRICT_CSP=true in production to drop.
    const isDev = process.env.NODE_ENV !== 'production';
    const allowUnsafeEval = isDev || process.env.STRICT_CSP !== 'true';

    const scriptSrc = [
      "'self'",
      "'unsafe-inline'",
      ...(allowUnsafeEval ? ["'unsafe-eval'"] : []),
      'https://challenges.cloudflare.com',
      'https://cdn.fakefourrecords.com',
      'https://js.stripe.com',
    ].join(' ');

    const cspParts = [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      // Next.js requires 'unsafe-inline' for CSS-in-JS / <style jsx>.
      "style-src 'self' 'unsafe-inline' https://cdn.fakefourrecords.com",
      // Tight img-src: enumerate the CDN + S3 rather than allowing any https:.
      // This prevents the page from being weaponized as a tracking pixel relay.
      "img-src 'self' data: blob: https://cdn.fakefourrecords.com https://*.s3.amazonaws.com https://*.amazonaws.com https://challenges.cloudflare.com https://www.gravatar.com",
      "font-src 'self' data: https://cdn.fakefourrecords.com",
      // Third-party iframes we embed: Turnstile + Stripe.
      "frame-src 'self' https://challenges.cloudflare.com https://js.stripe.com https://hooks.stripe.com",
      "worker-src 'self' blob:",
      // Stripe API + Maps + own CDN. Add more connect targets here (do NOT use https:).
      "connect-src 'self' https://api.stripe.com https://maps.googleapis.com https://cdn.fakefourrecords.com https://*.s3.amazonaws.com https://*.amazonaws.com",
      // Restrict media to own CDN and S3 buckets (drop the wildcard https:).
      "media-src 'self' blob: https://cdn.fakefourrecords.com https://*.s3.amazonaws.com https://*.amazonaws.com",
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
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(self "https://js.stripe.com")',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
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
