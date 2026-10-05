/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useMemo } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AlertTriangle } from 'lucide-react';

import { CreditConfirmationDialog } from '@/components/credit-confirmation-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  useDeleteReleaseMutation,
  usePublishReleaseMutation,
} from '@/hooks/mutations/use-release-mutations';
import { useCreditDecisions } from '@/hooks/use-credit-decisions';
import { useDebounce } from '@/hooks/use-debounce';
import { ENTITIES } from '@/lib/constants';
import type { ReleaseListItem } from '@/lib/types/media-models';
import { getDisplayName } from '@/lib/utils/get-display-name';

import {
  useInfiniteReleasesQuery,
  type ReleasesQueryParams,
} from './_hooks/use-infinite-releases-query';
import { DataView } from './data-view';
import {
  useDataViewFilters,
  useDataViewFiltersHydration,
  type EntityFilters,
} from './use-data-view-filters';

import type { DataViewFilters, EntityMutationResult } from './data-view-types';

/**
 * Computes the album artist display string from artistReleases
 */
const getAlbumArtist = (release: ReleaseListItem): string => {
  if (!release.artistReleases || release.artistReleases.length === 0) {
    return '-';
  }

  return release.artistReleases
    .map((ar: ReleaseListItem['artistReleases'][number]) => getDisplayName(ar.artist))
    .filter(Boolean)
    .join(', ');
};

interface ReleaseDataViewProps {
  /**
   * Show only the published releases whose byline names nobody (ADR-0015):
   * the dashboard's Releases tile links here with `?byline=missing`.
   */
  withoutByline?: boolean;
}

/** The toggles the list applies while it holds only the releases without a byline. */
const PUBLISHED_ONLY = { showPublished: true, showUnpublished: false, showDeleted: false };

interface ReleaseListFilters {
  hydrated: boolean;
  query: ReleasesQueryParams;
  filters: DataViewFilters;
}

/**
 * The list's search and toggles, and the query they make. While the list
 * holds the releases without a byline, its toggles show what it applies
 * (published only), and changing one leaves that view for the full list.
 */
const useReleaseListFilters = (withoutByline: boolean): ReleaseListFilters => {
  const stored = useDataViewFilters((state) => state.releases);
  const setFilters = useDataViewFilters((state) => state.setFilters);
  const hydrated = useDataViewFiltersHydration();
  const router = useRouter();
  // flushKey: a rehydrated search reaches the query without the debounce lag.
  const debouncedSearch = useDebounce(stored.search, 300, { flushKey: hydrated });

  const toggle = useCallback(
    (patch: Partial<EntityFilters>): void => {
      if (withoutByline) {
        router.replace('/admin/releases');
      }
      setFilters('releases', patch);
    },
    [withoutByline, router, setFilters]
  );

  const shown = withoutByline ? PUBLISHED_ONLY : stored;
  // Both same → no publish filter; otherwise the enabled one.
  const published = shown.showPublished === shown.showUnpublished ? null : shown.showPublished;

  return {
    hydrated,
    query: { search: debouncedSearch, published, deleted: shown.showDeleted, withoutByline },
    filters: {
      search: stored.search,
      onSearchChange: (value) => setFilters('releases', { search: value }),
      showPublished: shown.showPublished,
      onShowPublishedChange: (value) => toggle({ showPublished: value }),
      showUnpublished: shown.showUnpublished,
      onShowUnpublishedChange: (value) => toggle({ showUnpublished: value }),
      showDeleted: shown.showDeleted,
      onShowDeletedChange: (value) => toggle({ showDeleted: value }),
    },
  };
};

/** Says what the list shows while it holds only the releases without a byline. */
const WithoutBylineNotice = (): React.ReactElement => (
  <Alert role="status" className="border-amber-700 bg-amber-50 text-amber-900">
    <AlertTriangle aria-hidden="true" />
    <AlertTitle>Published releases without a byline</AlertTitle>
    <AlertDescription>
      <p>
        Each one&apos;s first credit is an archived or unpublished artist, or it credits nobody, so
        its public page names no artist. Publish that artist, or move a public artist to the front
        of the credits.
      </p>
      <Link href="/admin/releases" className="font-medium underline">
        Show all releases
      </Link>
    </AlertDescription>
  </Alert>
);

export const ReleaseDataView = ({ withoutByline = false }: ReleaseDataViewProps) => {
  const { publishReleaseAsync } = usePublishReleaseMutation();
  const { deleteReleaseAsync } = useDeleteReleaseMutation();
  const { requestDecisions, confirmation, confirm, cancel } = useCreditDecisions();

  // A release publishes its credited artists only by confirmation (ADR-0015):
  // ask the admin about each one before the publish is sent.
  const publishRelease = useCallback(
    async (releaseId: string): Promise<EntityMutationResult> => {
      const decisions = await requestDecisions({ releaseId });
      if (!decisions) {
        return { success: false, cancelled: true };
      }
      return publishReleaseAsync({ releaseId, decisions });
    },
    [requestDecisions, publishReleaseAsync]
  );
  const fieldsToShow = [
    'title',
    'albumArtist',
    'catalogNumber',
    'releasedOn',
    'formats',
    'createdAt',
    'updatedAt',
    'publishedAt',
  ];

  const { hydrated, query, filters } = useReleaseListFilters(withoutByline);

  const {
    data,
    isPending,
    isFetching,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteReleasesQuery(query, { enabled: hydrated });

  // Flatten the infinite pages and add the computed albumArtist field.
  const rows = useMemo(
    () =>
      data?.pages
        .flatMap((page) => page.rows)
        .map((release) => ({ ...release, albumArtist: getAlbumArtist(release) })) ?? [],
    [data]
  );

  if (error) {
    return <div>Error loading releases</div>;
  }

  if (isPending) {
    return <div>Loading releases...</div>;
  }

  return (
    <>
      {withoutByline && <WithoutBylineNotice />}
      <CreditConfirmationDialog
        confirmation={confirmation}
        confirmLabel="Publish release"
        onConfirm={confirm}
        onCancel={cancel}
      />
      <DataView<ReleaseListItem & { albumArtist: string }>
        entity={ENTITIES.release}
        data={{ releases: rows }}
        fieldsToShow={fieldsToShow}
        imageField="images"
        forceHardDelete
        mutations={{
          publish: publishRelease,
          delete: (id) => deleteReleaseAsync({ releaseId: id }),
        }}
        refetch={refetch}
        isPending={isPending}
        isFetching={isFetching}
        error={null}
        pagination={{ hasNextPage, fetchNextPage, isFetchingNextPage }}
        filters={filters}
      />
    </>
  );
};
