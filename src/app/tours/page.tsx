/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { ImageHeading } from '@/components/ui/image-heading';
import { queryKeys } from '@/lib/query-keys';
import { TourRepository } from '@/lib/repositories/tours/tour-repository';
import { getQueryClient } from '@/lib/utils/get-query-client';
import { serializeForResponse } from '@/lib/utils/serialize-for-response';

import { ToursContent } from './components/tours-content';

/**
 * Public tours listing page with search functionality.
 * Server Component prefetches tour data for SSR, client component handles interactivity.
 */
export default async function ToursPage() {
  const queryClient = getQueryClient();

  await queryClient.prefetchQuery({
    queryKey: queryKeys.tours.list(),
    // Read the repository directly instead of self-fetching /api/tours. The
    // internal HTTP roundtrip fails silently under load on the standalone
    // server (prefetchQuery swallows the error), leaving the list un-hydrated
    // so the client must refetch — the source of the flaky "0 tour cards"
    // E2E failures. Mirror the route's JSON shape (Date → ISO string).
    queryFn: async () => {
      const tours = await TourRepository.findAll({ limit: 100 });
      return serializeForResponse({ tours, count: tours.length });
    },
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="container mx-auto py-8">
        <div className="mb-8 space-y-2">
          <ImageHeading src="/media/headings/TOURS.webp" alt="tours" imageHeight={480} priority />
          <p className="text-zinc-950-foreground text-lg">
            Search and browse upcoming and recent tour dates
          </p>
        </div>

        <ToursContent />
      </div>
    </HydrationBoundary>
  );
}
