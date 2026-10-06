/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import localFont from 'next/font/local';

import { Toaster } from '@/components/ui/sonner';

import { ChatLauncher } from './components/chat/chat-launcher';
import { Footer } from './components/footer/footer';
import { Header } from './components/header/header';
import { Providers } from './components/providers';
import { IosInstallPrompt } from './components/pwa/ios-install-prompt';
import { ServiceWorkerRegister } from './components/pwa/service-worker-register';
import { MAIN_CONTENT_ID, SkipNavLink } from './components/skip-nav-link';

import type { Metadata, Viewport } from 'next';

import './globals.css';

// Jost is the body font, loaded from the two variable-weight files in
// `./fonts` (latin subset, SIL OFL — see `fonts/Jost-LICENSE.txt`) rather than
// through `next/font/google`. The Google loader downloads the font while the
// app builds, so a failed download fails the build; with the files in the
// repo a build needs no network. They are still emitted to
// `_next/static/media` and served from the CDN like every other asset.
//
// We disable next/font's auto-preload because the loader would emit a
// `<link rel=preload>` for both files while first paint is mostly upright
// text (the italic is used only by the featured player's NowPlayingHeading).
// Preloading both would compete with the LCP image fetch for early
// bandwidth; with `inlineCss` the `@font-face` rules arrive with the HTML
// anyway, so discovery is already immediate.
// `display: 'swap'` lets the page render with the fallback first and swap
// to Jost when the font is fetched, and `next/font`'s automatic
// `adjustFontFallback` (size-adjust descriptors on an Arial fallback)
// prevents the swap from causing layout shift.
//
// Only `jost.variable` is used, on <html>: it defines `--font-jost`, which
// globals.css's `@theme` reads for `--font-sans`, and Tailwind's preflight
// reads `--font-sans` for the document default. That one path covers every
// page and the `font-sans` utility alike; `jost.className` would be a second,
// competing mechanism (and `font-sans` subtrees would override it anyway).
const jost = localFont({
  src: [
    { path: './fonts/jost-latin-wght-normal.woff2', weight: '100 900', style: 'normal' },
    { path: './fonts/jost-latin-wght-italic.woff2', weight: '100 900', style: 'italic' },
  ],
  variable: '--font-jost',
  display: 'swap',
  preload: false,
});

// Server-side environment validation on startup
/* v8 ignore next 5 -- module-level server-only code; window is always defined in jsdom test env */
if (typeof window === 'undefined') {
  // Dynamic import to avoid bundling in client
  import('@/lib/config/env-validation').then(({ validateEnvironment }) => {
    validateEnvironment();
  });
}

// Client-side: Detect and warn about HTTPS/HTTP mismatch in development
/* v8 ignore next 7 -- development-only HTTPS localhost warning; requires specific window.location mock */
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  if (window.location.protocol === 'https:' && window.location.hostname === 'localhost') {
    console.error(
      '🚨 HTTPS DETECTED: You are accessing localhost via HTTPS. ' +
        'This will cause authentication and API issues. ' +
        'Please use http://localhost:3000 instead.'
    );
  }
}

/**
 * Render every route dynamically. The app is request-driven (auth/session,
 * per-user content, live DB data) and intentionally prerenders nothing — there
 * is no `generateStaticParams` anywhere. The root layout was previously dynamic
 * implicitly because it read the request `User-Agent` to pick a header layout;
 * that detection was removed once the header became viewport-responsive (CSS),
 * which let Next.js try to statically prerender pages and fail on request-time
 * APIs (e.g. `useSearchParams()` in the global `ChatLauncher`). Declaring it
 * here restores the previous behavior explicitly, matching the per-page
 * `force-dynamic` already used on the home and admin routes.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Fake Four Inc.',
  description:
    'Official site of Fake Four Inc., an independent record label based in New Haven, CT, dedicated to promoting innovative and genre-defying music from around the world.',
  applicationName: 'Fake Four Inc.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Fake Four Inc.',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#000000',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={jost.variable} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://cdn.fakefourrecords.com" />
        <link rel="dns-prefetch" href="https://cdn.fakefourrecords.com" />
        {/* No global Stripe hint: it shipped in every page's head but Stripe
            only loads at checkout — PurchaseCheckoutStep preconnects where
            loadStripe actually fires. */}
        {/* crossOrigin is mandatory: font fetches are CORS-mode, so omitting it makes Chrome double-fetch the file. */}
        <link
          rel="preload"
          href="/media/FakeFourCutout-Regular.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body
        className="xl:zine-desk flex min-h-screen max-w-full flex-col overflow-x-clip antialiased"
        suppressHydrationWarning
      >
        <Providers>
          <SkipNavLink />
          <Header />
          <main
            id={MAIN_CONTENT_ID}
            tabIndex={-1}
            className="xl:zine-page-edges mx-auto flex w-full grow flex-col overflow-x-clip outline-none xl:max-w-[83rem] xl:px-6"
          >
            {children}
          </main>
          <Footer />
          <ChatLauncher />
        </Providers>
        <Toaster position="bottom-center" />
        <ServiceWorkerRegister />
        <IosInstallPrompt />
      </body>
    </html>
  );
}
