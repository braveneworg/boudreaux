/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import TourForm from '@/app/admin/tours/components/tour-form';
import { TourRepository } from '@/lib/repositories/tours/tour-repository';

export const dynamic = 'force-dynamic';

interface TourEditPageProps {
  params: Promise<{ tourId: string }>;
}

export default async function TourEditPage({ params }: TourEditPageProps) {
  const { tourId } = await params;
  const initialTour = await TourRepository.findById(tourId);

  return <TourForm tourId={tourId} initialTour={initialTour} />;
}
