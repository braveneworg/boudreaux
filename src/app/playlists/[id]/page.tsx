/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Shared playlist page at `/playlists/[id]` (sign-in required; the owner or —
 * for public playlists — any signed-in user; everything else is a uniform 404).
 * Server Component: resolves the detail through the service, seeds the
 * `playlists.detail(id)` cache, and hydrates the client island (download row,
 * inline player, share popover, owner deep link back into the creator).
 */
import { notFound, redirect } from 'next/navigation';

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { PlaylistDetailContent } from '@/app/components/playlists/playlist-detail-content';
import { ContentContainer } from '@/app/components/ui/content-container';
import { PageContainer } from '@/app/components/ui/page-container';
import { ZineHeading } from '@/app/components/ui/zine-heading';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import { auth } from '@/auth';
import { queryKeys } from '@/lib/query-keys';
import { PlaylistService } from '@/lib/services/playlist-service';
import { getQueryClient } from '@/lib/utils/get-query-client';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Playlist',
  description: 'Listen to a playlist from the Fake Four catalog.',
};

export interface PlaylistDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PlaylistDetailPage({ params }: PlaylistDetailPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/signin');
  }

  const { id } = await params;

  if (!isValidObjectId(id)) {
    notFound();
  }

  // Owner-or-public read; null covers missing AND private-unowned uniformly.
  const detail = await PlaylistService.getOwnedOrPublicDetail(id, session.user.id);

  if (!detail) {
    notFound();
  }

  const queryClient = getQueryClient();
  // The service already returns the wire shape of GET /api/playlists/[id], so
  // seeding the detail cache directly keeps hydration byte-identical without a
  // self-fetch (same reasoning as the /playlists list prefetch).
  queryClient.setQueryData(queryKeys.playlists.detail(id), detail);

  const breadcrumbItems = [
    { anchorText: 'Home', url: '/', isActive: false },
    { anchorText: 'My Playlists', url: '/playlists', isActive: false },
    { anchorText: detail.title, url: `/playlists/${id}`, isActive: true },
  ];

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageContainer>
        <ContentContainer>
          <ZinePanel chat accent="kraft" breadcrumbs={breadcrumbItems}>
            <ZineHeading level={1}>{detail.title}</ZineHeading>
            <PlaylistDetailContent playlistId={id} />
          </ZinePanel>
        </ContentContainer>
      </PageContainer>
    </HydrationBoundary>
  );
}
