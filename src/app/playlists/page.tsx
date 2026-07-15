/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Signed-in My Playlists page at `/playlists`.
 * Server Component that gates on auth, prefetches the first page of the
 * user's playlists for SSR, then hydrates the client content island (creator
 * + list panes with the mobile view swap and `?edit=` deep link).
 */
import { Suspense } from 'react';

import { redirect } from 'next/navigation';

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { PlaylistsContent } from '@/app/components/playlists/playlists-content';
import { ContentContainer } from '@/app/components/ui/content-container';
import { PageContainer } from '@/app/components/ui/page-container';
import { Skeleton } from '@/app/components/ui/skeleton';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import { auth } from '@/auth';
import { PLAYLISTS_PAGE_SIZE } from '@/lib/constants/playlists';
import { queryKeys } from '@/lib/query-keys';
import { PlaylistService } from '@/lib/services/playlist-service';
import type { PlaylistsResponse } from '@/lib/types/domain/playlist';
import { getQueryClient } from '@/lib/utils/get-query-client';
import { loggers } from '@/lib/utils/logger';

import { ImageHeading } from '../components/ui/image-heading';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Playlists',
  description: 'Build and manage your playlists from the Fake Four catalog.',
};

const breadcrumbItems = [
  { anchorText: 'Home', url: '/', isActive: false },
  { anchorText: 'My Playlists', url: '/playlists', isActive: true },
];

/**
 * Builds the SSR prefetch queryFn for the signed-in user's first list page —
 * exactly the shape the client's `usePlaylistsQuery` resolves to
 * (`fetchAndParse` of GET /api/playlists with skip=0&take=PLAYLISTS_PAGE_SIZE).
 * The service already returns the wire shape — `toListRow` serialises
 * `updatedAt` to an ISO string and the route hands the result to
 * `NextResponse.json` unchanged — so reading it directly avoids a self-fetch
 * while keeping hydration byte-identical. A service failure degrades to an
 * empty list (the client refetches) rather than crashing the page. The user
 * scope stays out of the query key on purpose: the client key is `mine()`.
 */
const buildMinePlaylistsQueryFn = (userId: string) => async (): Promise<PlaylistsResponse> => {
  try {
    return await PlaylistService.getMyPlaylists(userId, {
      skip: 0,
      take: PLAYLISTS_PAGE_SIZE,
    });
  } catch (error) {
    loggers.media.error('Playlists prefetch failed', error);
    return { rows: [], nextSkip: null };
  }
};

export default async function PlaylistsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/signin');
  }

  const queryClient = getQueryClient();

  await queryClient.prefetchQuery({
    queryKey: queryKeys.playlists.mine(),
    queryFn: buildMinePlaylistsQueryFn(session.user.id),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageContainer>
        <ContentContainer>
          <ZinePanel chat accent="kraft" breadcrumbs={breadcrumbItems}>
            <ImageHeading
              src="/media/headings/MY_PLAYLISTS.webp"
              alt="My Playlists"
              imageHeight={480}
              priority
            />
            {/* useSearchParams inside the island requires a Suspense boundary. */}
            <Suspense
              fallback={
                <div aria-busy="true" className="flex flex-col gap-4 py-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-64 w-full" />
                </div>
              }
            >
              <PlaylistsContent />
            </Suspense>
          </ZinePanel>
        </ContentContainer>
      </PageContainer>
    </HydrationBoundary>
  );
}
