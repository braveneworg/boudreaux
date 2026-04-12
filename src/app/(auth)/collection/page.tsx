/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * User collection page at `/collection`.
 * Server Component that gates on auth, prefetches the user's collection,
 * then hydrates client components for interactivity.
 */
import { redirect } from 'next/navigation';

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { CollectionContent } from '@/app/components/collection-content';
import { ContentContainer } from '@/app/components/ui/content-container';
import PageContainer from '@/app/components/ui/page-container';
import { queryKeys } from '@/lib/query-keys';
import { fetchApi } from '@/lib/utils/fetch-api';
import { getQueryClient } from '@/lib/utils/get-query-client';

import { auth } from '../../../../auth';

export default async function CollectionPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/signin');
  }

  const queryClient = getQueryClient();

  await queryClient.prefetchQuery({
    queryKey: queryKeys.collection.list(),
    queryFn: () => fetchApi('/api/user/collection', { forwardCookies: true }),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageContainer>
        <ContentContainer>
          <CollectionContent />
        </ContentContainer>
      </PageContainer>
    </HydrationBoundary>
  );
}
