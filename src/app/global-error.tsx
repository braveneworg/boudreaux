/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect } from 'react';

import { reportClientError } from '@/utils/report-client-error';

import './globals.css';

interface GlobalErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Root error boundary — replaces the root layout when it crashes, so it must
 * render its own <html>/<body> and stay dependency-light (no shadcn/ui).
 */
export default function GlobalErrorPage({ error, reset }: GlobalErrorPageProps): React.JSX.Element {
  useEffect(() => {
    reportClientError(error, 'global');
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-background text-foreground zine-accent-storm">
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
          {/* Hand-rolled zine panel — ZinePanel/ImageHeading/Button stay off-limits here. */}
          <div className="bg-menu-item-tan-100 shadow-zine relative w-full max-w-2xl border-2 border-black p-6 text-center sm:p-8">
            <img src="/media/headings/ERROR.webp" alt="error" className="w-full" />
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p>An unexpected error occurred. Please try again, or come back later.</p>
            <button
              type="button"
              onClick={reset}
              className="shadow-zine-sm border-2 border-black bg-zinc-50 px-4 py-2 font-medium transition-all hover:bg-black hover:text-white focus-visible:outline-2 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
