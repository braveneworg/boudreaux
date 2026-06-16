/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { TOURS_PAGE_SIZE } from '@/app/hooks/use-infinite-tours-query';
import { ImageHeading } from '@/components/ui/image-heading';
import { queryKeys } from '@/lib/query-keys';
import { TourRepository } from '@/lib/repositories/tours/tour-repository';
import { computeNextSkip } from '@/lib/types/pagination';
import { getQueryClient } from '@/lib/utils/get-query-client';
import { serializeForResponse } from '@/lib/utils/serialize-for-response';

import { ToursContent } from './components/tours-content';

/**
 * Public tours listing page with search functionality.
 * Server Component prefetches tour data for SSR, client component handles interactivity.
 */
export default async function ToursPage() {
  const queryClient = getQueryClient();

  // Prefetch the first (unsearched) page as an infinite query. The query key and
  // initialPageParam must exactly match the client `useInfiniteToursQuery('')` hook or
  // hydration misses and the client refetches.
  await queryClient.prefetchInfiniteQuery({
    queryKey: queryKeys.tours.infinite(''),
    initialPageParam: 0,
    // Read the repository directly instead of self-fetching /api/tours. The
    // internal HTTP roundtrip fails silently under load on the standalone
    // server (prefetch swallows the error), leaving the list un-hydrated so the
    // client must refetch — the source of the flaky "0 tour cards" E2E
    // failures. Mirror the route's JSON shape (Date → ISO string).
    queryFn: async () => {
      const rows = await TourRepository.findAll({ skip: 0, take: TOURS_PAGE_SIZE });
      return serializeForResponse({
        rows,
        nextSkip: computeNextSkip(rows.length, 0, TOURS_PAGE_SIZE),
      });
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
