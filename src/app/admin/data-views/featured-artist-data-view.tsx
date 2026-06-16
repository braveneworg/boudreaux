/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';

import { Globe } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/app/components/ui/button';
import { Spinner } from '@/app/components/ui/spinner/spinner';
import { useDebounce } from '@/app/hooks/use-debounce';
import { useInfiniteFeaturedArtistsQuery } from '@/app/hooks/use-infinite-featured-artists-query';
import { publishFeaturedArtistsToSiteAction } from '@/lib/actions/publish-featured-artists-action';
import { ENTITIES } from '@/lib/constants';
import type { FeaturedArtist } from '@/lib/types/media-models';
import { getFeaturedArtistDisplayName } from '@/lib/utils/get-featured-artist-display-name';

import { DataView } from './data-view';

export const FeaturedArtistDataView = () => {
  const [isPublishing, startPublishTransition] = useTransition();
  const fieldsToShow = [
    'displayName',
    'featuredOn',
    'featuredUntil',
    'position',
    'description',
    'createdAt',
    'updatedAt',
    'publishedOn',
  ];

  const [search, setSearch] = useState('');
  const [showPublished, setShowPublished] = useState(true);
  const [showUnpublished, setShowUnpublished] = useState(true);
  const [showDeleted, setShowDeleted] = useState(false);
  const debouncedSearch = useDebounce(search);

  // Both same → no publish filter; otherwise the enabled one.
  const published = showPublished === showUnpublished ? null : showPublished;

  const {
    data,
    isPending,
    isFetching,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteFeaturedArtistsQuery({ search: debouncedSearch, published, deleted: showDeleted });

  const rows = useMemo(() => data?.pages.flatMap((page) => page.rows) ?? [], [data]);

  const handlePublish = useCallback(() => {
    startPublishTransition(async () => {
      const result = await publishFeaturedArtistsToSiteAction();
      if (result.success) {
        toast.success('Featured artists published to landing page');
      } else {
        toast.error(result.error ?? 'Failed to publish');
      }
    });
  }, []);

  if (error) {
    return <div>Error loading featured artists</div>;
  }

  if (isPending) {
    return <div>Loading featured artists...</div>;
  }

  return (
    <>
      <div className="mb-4">
        <Button
          className="w-full"
          variant="outline"
          onClick={handlePublish}
          disabled={isPublishing}
        >
          <Globe className="mr-2 size-4" />
          {isPublishing ? 'Publishing...' : 'Publish to Landing Page'}
          {isPublishing && <Spinner className="ml-2 size-4" />}
        </Button>
      </div>
      <DataView<FeaturedArtist>
        entity={ENTITIES.featuredArtist}
        data={{ featuredArtists: rows }}
        fieldsToShow={fieldsToShow}
        refetch={refetch}
        isPending={isPending}
        isFetching={isFetching}
        error={null}
        hasNextPage={hasNextPage}
        fetchNextPage={fetchNextPage}
        isFetchingNextPage={isFetchingNextPage}
        searchValue={search}
        onSearchChange={setSearch}
        showPublished={showPublished}
        onShowPublishedChange={setShowPublished}
        showUnpublished={showUnpublished}
        onShowUnpublishedChange={setShowUnpublished}
        showDeleted={showDeleted}
        onShowDeletedChange={setShowDeleted}
        getItemDisplayName={(item) => getFeaturedArtistDisplayName(item) ?? 'Unnamed'}
      />
    </>
  );
};
