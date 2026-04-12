/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Loader2 } from 'lucide-react';

import { useToursQuery } from '@/app/hooks/use-tours-query';

import { ToursPageClient } from './tours-page-client';

/**
 * Client content wrapper for the tours listing page.
 * Uses TanStack Query to fetch tours data (hydrated from SSR prefetch).
 */
export const ToursContent = () => {
  const { isPending, error, data } = useToursQuery();

  if (isPending) {
    return (
      <div className="flex min-h-100 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-100 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/5 p-8">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-muted-foreground">Failed to load tours</h3>
          <p className="mt-2 text-sm text-muted-foreground">Please try again later.</p>
        </div>
      </div>
    );
  }

  return <ToursPageClient tours={data?.tours ?? []} />;
};
