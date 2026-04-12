/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Loader2 } from 'lucide-react';

import { useTourQuery } from '@/app/hooks/use-tour-query';

import { TourDetail } from './tour-detail';

interface TourDetailContentProps {
  tourId: string;
}

/**
 * Client content wrapper for the tour detail page.
 * Uses TanStack Query to fetch tour data (hydrated from SSR prefetch).
 */
export const TourDetailContent = ({ tourId }: TourDetailContentProps) => {
  const { isPending, error, data } = useTourQuery(tourId);

  if (isPending) {
    return (
      <div className="flex min-h-100 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-100 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/5 p-8">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-muted-foreground">
            {error ? 'Failed to load tour' : 'Tour not found'}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {error ? 'Please try again later.' : 'The tour you are looking for does not exist.'}
          </p>
        </div>
      </div>
    );
  }

  return <TourDetail tour={data} />;
};
