/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useMemo, useState } from 'react';

import { Globe } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/app/components/ui/button';
import { Spinner } from '@/app/components/ui/spinner/spinner';
import {
  useDeleteFeaturedArtistMutation,
  usePublishFeaturedArtistMutation,
  usePublishFeaturedArtistsMutation,
} from '@/app/hooks/mutations/use-featured-artist-mutations';
import { useDebounce } from '@/app/hooks/use-debounce';
import { useInfiniteFeaturedArtistsQuery } from '@/app/hooks/use-infinite-featured-artists-query';
import { ENTITIES } from '@/lib/constants';
import type { FeaturedArtist } from '@/lib/types/media-models';
import { getFeaturedArtistDisplayName } from '@/lib/utils/get-featured-artist-display-name';

import { DataView } from './data-view';

export const FeaturedArtistDataView = () => {
  const { publishFeaturedArtistsAsync, isPublishingFeaturedArtists: isPublishing } =
    usePublishFeaturedArtistsMutation();
  const { publishFeaturedArtistAsync } = usePublishFeaturedArtistMutation();
  const { deleteFeaturedArtistAsync } = useDeleteFeaturedArtistMutation();
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

  const handlePublish = useCallback(async () => {
    const result = await publishFeaturedArtistsAsync();
    if (result.success) {
      toast.success('Featured artists published to landing page');
    } else {
      toast.error(result.error ?? 'Failed to publish');
    }
  }, [publishFeaturedArtistsAsync]);

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
        mutations={{
          publish: (id) => publishFeaturedArtistAsync({ featuredArtistId: id }),
          delete: (id) => deleteFeaturedArtistAsync({ featuredArtistId: id }),
        }}
        refetch={refetch}
        isPending={isPending}
        isFetching={isFetching}
        error={null}
        pagination={{ hasNextPage, fetchNextPage, isFetchingNextPage }}
        filters={{
          search,
          onSearchChange: setSearch,
          showPublished,
          onShowPublishedChange: setShowPublished,
          showUnpublished,
          onShowUnpublishedChange: setShowUnpublished,
          showDeleted,
          onShowDeletedChange: setShowDeleted,
        }}
        getItemDisplayName={(item) => getFeaturedArtistDisplayName(item) ?? 'Unnamed'}
      />
    </>
  );
};
