import { BANNER_SLOTS } from './src/lib/constants/banner-slots';
import { IMAGE_VARIANT_DEVICE_SIZES } from './src/lib/constants/image-variants';

import type { NextConfig } from 'next';

// Precompute the home page's LCP image preload so it can be emitted as an
// HTTP Link: response header — earlier than any <link rel=preload> in <head>.
// URL building is inlined (rather than imported from cloudfront-loader) because
// Next.js's next.config.ts transpiler does not resolve the `@/` path alias.
const LCP_CDN_DOMAIN =
  process.env.NEXT_PUBLIC_CDN_DOMAIN ?? process.env.CDN_DOMAIN ?? 'https://cdn.fakefourrecords.com';

function buildLcpBannerUrl(filename: string, width: number): string {
  const encoded = filename
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  const dot = encoded.lastIndexOf('.');
  const base = dot === -1 ? encoded : encoded.slice(0, dot);
  const ext = dot === -1 ? '' : encoded.slice(dot);
  return `${LCP_CDN_DOMAIN}/media/banners/${base}_w${width}${ext}`;
}

const HOME_LCP_FILENAME = BANNER_SLOTS[0]?.filename;
const HOME_LCP_WIDTH = IMAGE_VARIANT_DEVICE_SIZES[IMAGE_VARIANT_DEVICE_SIZES.length - 1];
const HOME_LCP_LINK_HEADER =
  HOME_LCP_FILENAME && HOME_LCP_WIDTH
    ? `<${buildLcpBannerUrl(HOME_LCP_FILENAME, HOME_LCP_WIDTH)}>; rel=preload; as=image; ` +
      `imagesrcset="${IMAGE_VARIANT_DEVICE_SIZES.map(
        (w) => `${buildLcpBannerUrl(HOME_LCP_FILENAME, w)} ${w}w`
      ).join(', ')}"; ` +
      `imagesizes="100vw"; fetchpriority="high"`
    : null;

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
    contentDispositionType: 'attachment',
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
    optimizeCss: true,
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

    // In E2E builds, the app runs on http://localhost in CI/Playwright.
    // Forcing upgrade-insecure-requests would rewrite localhost URLs to HTTPS
    // and break client hydration/scripts in standalone test runs.
    const shouldUpgradeInsecureRequests =
      process.env.NODE_ENV === 'production' && process.env.SKIP_CDN_ASSET_PREFIX !== 'true';

    if (shouldUpgradeInsecureRequests) {
      cspParts.push('upgrade-insecure-requests');
    }

    const homeHeaders = [
      {
        key: 'Cache-Control',
        value: 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
      },
      ...(HOME_LCP_LINK_HEADER ? [{ key: 'Link', value: HOME_LCP_LINK_HEADER }] : []),
    ];

    return [
      // Preload the LCP banner via HTTP Link header so the browser can start
      // fetching it before the HTML body parses any <link rel=preload> tags.
      {
        source: '/',
        headers: homeHeaders,
      },
      // Next.js hashed build assets are immutable and safe to cache forever.
      // Also emit CORS header for cross-origin font/chunk usage via assetPrefix.
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
        ],
      },
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
