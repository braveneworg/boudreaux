/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Jost } from 'next/font/google';
import { headers } from 'next/headers';
import { userAgentFromString } from 'next/server';

import { Toaster } from '@/components/ui/sonner';

import Footer from './components/footer/footer';
import { Header } from './components/header/header';
import { Providers } from './components/providers';

import type { Metadata } from 'next';

import './globals.css';

const jost = Jost({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-jost',
  display: 'optional',
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

export const metadata: Metadata = {
  title: 'Fake Four Inc.',
  description:
    'Official site of Fake Four Inc., an independent record label based in New Haven, CT, dedicated to promoting innovative and genre-defying music from around the world.',
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const userAgent = (await headers()).get('user-agent') || '';
  const { device } = userAgentFromString(userAgent);
  const isMobile = device?.type === 'mobile' || device?.type === 'tablet';

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://cdn.fakefourrecords.com" />
        <link rel="dns-prefetch" href="https://cdn.fakefourrecords.com" />
        {/* The home page LCP banner is preloaded via an HTTP Link: response
            header (see next.config.ts). Other routes don't render that image,
            so emitting a global preload here would trigger the browser's
            "preloaded but not used" warning. Next.js's <Image priority>
            auto-preload covers the home banner during SSR. */}
        {/* Keep a lightweight global DNS prefetch for Stripe; add a route-level preconnect where Stripe is actually loaded if needed. */}
        <link rel="dns-prefetch" href="https://js.stripe.com" />
      </head>
      <body
        className={`${jost.className} antialiased flex flex-col min-h-screen overflow-x-hidden max-w-full`}
        suppressHydrationWarning
      >
        <Providers>
          <Header isMobile={isMobile} />
          <main className="flex flex-col grow w-full max-w-full overflow-x-hidden">{children}</main>
          <Footer />
        </Providers>
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
