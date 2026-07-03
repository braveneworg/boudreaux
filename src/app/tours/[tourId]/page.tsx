/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { notFound } from 'next/navigation';

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { ContentContainer } from '@/app/components/ui/content-container';
import { PageContainer } from '@/app/components/ui/page-container';
import type { TourWithRelations } from '@/app/hooks/use-tour-query';
import { TourDetailContent } from '@/app/tours/components/tour-detail-content';
import { queryKeys } from '@/lib/query-keys';
import { TourRepository } from '@/lib/repositories/tours/tour-repository';
import { getQueryClient } from '@/lib/utils/get-query-client';

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

  const tour = await TourRepository.findById(tourId);

  if (!tour) {
    notFound();
  }

  // Round-trip through JSON to normalize Date → string and BigInt → Number for the client cache.
  const tourData = JSON.parse(
    JSON.stringify(tour, (_key, v) => (typeof v === 'bigint' ? Number(v) : v))
  ) as TourWithRelations;
  queryClient.setQueryData(queryKeys.tours.detail(tourId), tourData);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageContainer>
        <ContentContainer>
          <TourDetailContent tourId={tourId} />
        </ContentContainer>
      </PageContainer>
    </HydrationBoundary>
  );
}
