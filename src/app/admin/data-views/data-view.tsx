/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useMemo } from 'react';
import type { ReactElement } from 'react';

import { useRouter } from 'next/navigation';

import { toast } from 'sonner';

import { Button } from '@/app/components/ui/button';
import { Spinner } from '@/app/components/ui/spinner/spinner';
import { getDisplayName } from '@/lib/utils/get-display-name';
import { toDisplayLabel, toEntityUrlPath } from '@/lib/utils/string-utils';

import { DataViewCard } from './components/data-view-card';
import { DataViewFiltersToolbar } from './components/data-view-filters';
import { LoadMoreTrigger } from './components/load-more-trigger';
import { ImagePreviewProvider } from './image-preview-context';

import type { DataViewProps, EntityMutation, MutationVerb } from './data-view-types';

export type {
  EntityMutation,
  EntityMutationResult,
  EntityMutations,
  DataViewFilters,
  DataViewPagination,
  DataViewProps,
} from './data-view-types';

/** Maps a mutation verb to its past tense for success-toast copy. */
const toPastTense = (verb: MutationVerb): string =>
  verb === 'publish' ? 'published' : verb === 'delete' ? 'deleted' : 'restored';

/** Props for the internal {@link DataViewBody} list + refresh-overlay region. */
interface DataViewBodyProps<T extends Record<string, unknown>> {
  items: T[];
  entity: DataViewProps<T>['entity'];
  entityUrlPath: string;
  entityDisplayLabel: string;
  fieldsToShow: string[];
  imageField?: string;
  coverArtField?: string;
  isPending: boolean;
  supportsSoftDelete: boolean;
  canRestore: boolean;
  pagination?: DataViewProps<T>['pagination'];
  showRefreshSkeleton: boolean;
  resolveDisplayName: (item: T) => string;
  onPublish: (item: T) => void;
  onDelete: (item: T) => void;
  onRestore: (item: T) => void;
}

/**
 * The list region: renders entity cards (or an empty message), the optional
 * load-more trigger, and the refresh overlay shown during a full refetch.
 */
const DataViewBody = <T extends Record<string, unknown>>({
  items,
  entity,
  entityUrlPath,
  entityDisplayLabel,
  fieldsToShow,
  imageField,
  coverArtField,
  isPending,
  supportsSoftDelete,
  canRestore,
  pagination,
  showRefreshSkeleton,
  resolveDisplayName,
  onPublish,
  onDelete,
  onRestore,
}: DataViewBodyProps<T>): ReactElement => (
  <div className="relative min-h-[60vh]" aria-busy={showRefreshSkeleton}>
    {items.length > 0 ? (
      <>
        <ul>
          {items.map((item) => (
            <li key={item.id as string}>
              <DataViewCard
                item={item}
                entity={entity}
                entityUrlPath={entityUrlPath}
                fieldsToShow={fieldsToShow}
                imageField={imageField}
                coverArtField={coverArtField}
                isPending={isPending}
                supportsSoftDelete={supportsSoftDelete}
                canRestore={canRestore}
                resolveDisplayName={resolveDisplayName}
                onPublish={onPublish}
                onDelete={onDelete}
                onRestore={onRestore}
              />
            </li>
          ))}
        </ul>
        {pagination?.fetchNextPage && <LoadMoreTrigger {...pagination} />}
      </>
    ) : (
      <p>No data available</p>
    )}
    {showRefreshSkeleton && (
      <div
        data-testid="data-view-overlay"
        role="status"
        aria-label={`Loading ${entityDisplayLabel}s`}
        className="bg-background/60 absolute inset-0 z-10 flex cursor-wait items-start justify-center pt-24 backdrop-blur-sm"
      >
        <div className="text-muted-foreground flex items-center gap-2">
          <Spinner className="size-5" />
          <span className="text-sm">{`Loading ${entityDisplayLabel}s...`}</span>
        </div>
      </div>
    )}
  </div>
);

/**
 * A generic data view for displaying and managing admin entities: a searchable,
 * filterable, infinitely-scrolling list of cards with create, edit, view, publish,
 * and delete/restore actions. Entity-specific wrappers inject data, mutations, and
 * controlled filter state.
 *
 * @template T - The entity type extending a record with string keys and unknown values.
 */
export const DataView = <T extends Record<string, unknown>>({
  entity,
  data,
  fieldsToShow,
  imageField,
  coverArtField,
  forceHardDelete = false,
  canCreate = true,
  getItemDisplayName,
  mutations,
  filters,
  pagination,
  refetch,
  isPending,
  isFetching = false,
  error,
}: DataViewProps<T>): ReactElement => {
  const router = useRouter();

  const resolveDisplayName = useCallback(
    (item: T) => (getItemDisplayName ? getItemDisplayName(item) : getDisplayName(item)),
    [getItemDisplayName]
  );

  // Get the URL-friendly path for the entity (e.g., "featuredArtist" -> "featured-artists")
  const entityUrlPath = toEntityUrlPath(entity);
  // Get the display-friendly label for the entity (e.g., "featuredArtist" -> "featured artist")
  const entityDisplayLabel = toDisplayLabel(entity);

  const items = useMemo(() => data?.[`${String(entity)}s`] ?? [], [data, entity]);

  // Check if entity supports soft delete by checking if the first item has a deletedOn property.
  const supportsSoftDelete = useMemo(() => {
    if (forceHardDelete) return false;
    if (items.length === 0) return true; // Default to soft delete for empty data
    // Check if 'deletedOn' exists in the first item (including if it's null)
    return 'deletedOn' in items[0];
  }, [items, forceHardDelete]);

  // Runs an injected entity mutation and maps its result to a toast + refetch.
  // Catches a rejected mutation (e.g. a Server Action transport failure) so the
  // UI always surfaces an error rather than an unhandled rejection.
  const runEntityMutation = useCallback(
    async (verb: MutationVerb, item: T, mutation: EntityMutation) => {
      try {
        const response = await mutation(item.id as string);
        if (response.success) {
          toast.success(
            `Successfully ${toPastTense(verb)} ${entityDisplayLabel} - ${resolveDisplayName(item)}`
          );
          refetch();
        } else {
          toast.error(
            `Failed to ${verb} ${entityDisplayLabel}: ${response.error || 'Unknown error'}`
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        toast.error(`Failed to ${verb} ${entityDisplayLabel}: ${message}`);
      }
    },
    [entityDisplayLabel, refetch, resolveDisplayName]
  );

  const handlePublish = useCallback(
    (item: T) => runEntityMutation('publish', item, mutations.publish),
    [runEntityMutation, mutations.publish]
  );
  const handleDelete = useCallback(
    (item: T) => runEntityMutation('delete', item, mutations.delete),
    [runEntityMutation, mutations.delete]
  );
  const handleRestore = useCallback(
    (item: T) =>
      mutations.restore ? runEntityMutation('restore', item, mutations.restore) : undefined,
    [runEntityMutation, mutations.restore]
  );

  // Show the full-area skeleton on a refetch (e.g. after publish/delete/restore),
  // but not while paging in more items — that keeps its own "Loading more..." spinner.
  const showRefreshSkeleton = isFetching && !pagination?.isFetchingNextPage;

  const handleCreate = useCallback(
    () => router?.push(`/admin/${entityUrlPath}/new`),
    [router, entityUrlPath]
  );

  return (
    <ImagePreviewProvider>
      <div className="mx-1">
        {canCreate && (
          <Button
            className="w-full"
            onClick={handleCreate}
          >{`Create ${entityDisplayLabel}`}</Button>
        )}
        {error && <div className="mb-2 text-red-600">{error}</div>}
        <DataViewFiltersToolbar
          filters={filters}
          entityDisplayLabel={entityDisplayLabel}
          supportsSoftDelete={supportsSoftDelete}
        />
        <DataViewBody
          items={items}
          entity={entity}
          entityUrlPath={entityUrlPath}
          entityDisplayLabel={entityDisplayLabel}
          fieldsToShow={fieldsToShow}
          imageField={imageField}
          coverArtField={coverArtField}
          isPending={isPending}
          supportsSoftDelete={supportsSoftDelete}
          canRestore={!!mutations.restore}
          pagination={pagination}
          showRefreshSkeleton={showRefreshSkeleton}
          resolveDisplayName={resolveDisplayName}
          onPublish={handlePublish}
          onDelete={handleDelete}
          onRestore={handleRestore}
        />
      </div>
    </ImagePreviewProvider>
  );
};
