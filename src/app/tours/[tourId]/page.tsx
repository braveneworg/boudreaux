/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { notFound } from 'next/navigation';

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import type { TourWithRelations } from '@/app/hooks/use-tour-query';
import { queryKeys } from '@/lib/query-keys';
import { getInternalApiUrl } from '@/lib/utils/get-internal-api-url';
import { getQueryClient } from '@/lib/utils/get-query-client';

import { TourDetailContent } from '../components/tour-detail-content';

export interface TourPageProps {
  params: Promise<{
    tourId: string;
  }>;
}

/**
 * Individual tour detail page.
 * Server Component prefetches tour data for SSR, calls notFound() on 404.
 */
export default async function TourPage({ params }: TourPageProps) {
  const { tourId } = await params;
  const queryClient = getQueryClient();

  // Fetch directly to inspect the response for 404 handling
  const url = getInternalApiUrl(`/api/tours/${encodeURIComponent(tourId)}`);
  const response = await fetch(url, { cache: 'no-store' });

  if (response.status === 404) {
    notFound();
  }

  if (response.ok) {
    const json = await response.json();
    const tour = (json.tour ?? json) as TourWithRelations;
    queryClient.setQueryData(queryKeys.tours.detail(tourId), tour);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="container mx-auto py-8">
        <TourDetailContent tourId={tourId} />
      </div>
    </HydrationBoundary>
  );
}
