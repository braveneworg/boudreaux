/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { ImageHeading } from '@/components/ui/image-heading';
import { ZinePanel } from '@/components/ui/zine-panel';
import { reportClientError } from '@/utils/report-client-error';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Route-segment error boundary. Reports the error (digest + truncated
 * message only) to the server log endpoint and offers a retry.
 */
export default function ErrorPage({ error, reset }: ErrorPageProps): React.JSX.Element {
  useEffect(() => {
    reportClientError(error, 'route');
  }, [error]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <ZinePanel accent="storm">
        <ImageHeading
          src="/media/headings/ERROR.webp"
          alt="error"
          imageHeight={480}
          imageClassName="w-full"
          priority
        />
        <h1 className="mb-2 text-2xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground mb-6">
          An unexpected error occurred. Please try again, or come back later.
        </p>
        <Button onClick={reset}>Try again</Button>
      </ZinePanel>
    </main>
  );
}
