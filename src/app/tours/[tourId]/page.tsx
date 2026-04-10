/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { notFound } from 'next/navigation';

import { getInternalApiUrl } from '@/lib/utils/get-internal-api-url';

import { TourDetail } from '../components/tour-detail';

export interface TourPageProps {
  params: Promise<{
    tourId: string;
  }>;
}

/**
 * Individual tour detail page
 * Server Component that fetches and displays a single tour with all details
 */
export default async function TourPage({ params }: TourPageProps) {
  const { tourId } = await params;

  const url = await getInternalApiUrl(`/api/tours/${tourId}`);
  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok) {
    notFound();
  }

  const { tour } = await res.json();

  if (!tour) {
    notFound();
  }

  return (
    <div className="container mx-auto py-8">
      <TourDetail tour={tour} />
    </div>
  );
}
