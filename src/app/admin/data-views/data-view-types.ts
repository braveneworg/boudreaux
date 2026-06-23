/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { AdminEntity } from '@/app/admin/types';

/** Plain result returned by the injected entity mutation callbacks. */
export interface EntityMutationResult {
  success: boolean;
  error?: string;
}

/**
 * An entity mutation injected by a `*-data-view` wrapper. Each wraps a TanStack
 * mutation hook (which owns cache invalidation) and resolves to a plain result
 * the DataView maps to a toast — keeping the generic DataView free of raw fetch.
 */
export type EntityMutation = (id: string) => Promise<EntityMutationResult>;

/** The set of mutations a `*-data-view` wrapper injects into the DataView. */
export interface EntityMutations {
  /** Publishes the entity (stamps its publish timestamp). */
  publish: EntityMutation;
  /** Deletes the entity — soft (archive) or hard, per the wrapper's wiring. */
  delete: EntityMutation;
  /** Restores a soft-deleted entity. Omitted for hard-delete-only entities. */
  restore?: EntityMutation;
}

/** Past-tense verb describing a completed mutation, used in toast copy. */
export type MutationVerb = 'publish' | 'delete' | 'restore';

/** Controlled search + visibility filters surfaced by the DataView toolbar. */
export interface DataViewFilters {
  /** Controlled, server-side search term. */
  search: string;
  /** Called when the search input changes. */
  onSearchChange: (value: string) => void;
  /** Controlled "show published" toggle. */
  showPublished: boolean;
  /** Called when the "show published" toggle changes. */
  onShowPublishedChange: (value: boolean) => void;
  /** Controlled "show unpublished" toggle. */
  showUnpublished: boolean;
  /** Called when the "show unpublished" toggle changes. */
  onShowUnpublishedChange: (value: boolean) => void;
  /** Controlled "show deleted" toggle. */
  showDeleted: boolean;
  /** Called when the "show deleted" toggle changes. */
  onShowDeletedChange: (value: boolean) => void;
}

/** Infinite-scroll paging state forwarded from the wrapper's query hook. */
export interface DataViewPagination {
  /** Whether there are more pages to load. */
  hasNextPage?: boolean;
  /** Fetches the next page. */
  fetchNextPage?: () => void;
  /** Whether the next page is currently being fetched. */
  isFetchingNextPage?: boolean;
}

/** A thumbnail/cover-art image opened in the preview dialog. */
export interface PreviewImage {
  src: string;
  altText?: string;
}

/** Public props for the generic {@link DataView}. */
export interface DataViewProps<T extends Record<string, unknown>> {
  /** The type of admin entity being displayed. */
  entity: AdminEntity;
  /**
   * The data to display, keyed by the pluralized entity name (e.g. `data['artists']`)
   * so the component can resolve entity-specific collections at runtime. `null` when
   * no data is available.
   */
  data: Record<string, T[]> | null;
  /** Field names from the entity to display in each card. */
  fieldsToShow: string[];
  /** Field name containing an array of images with a `src` property. */
  imageField?: string;
  /** Field name containing a direct cover art URL string. */
  coverArtField?: string;
  /** Force hard delete (no Restore/"Show deleted" UI) even if the entity has a deletedOn field. */
  forceHardDelete?: boolean;
  /**
   * Whether the "Create {entity}" button is shown. Defaults to true. Artists set
   * this to false because new artists are created only from a release.
   */
  canCreate?: boolean;
  /** Custom display name resolver for entity-specific name formatting. */
  getItemDisplayName?: (item: T) => string;
  /** Publish/delete/restore callbacks injected by the wrapper. */
  mutations: EntityMutations;
  /** Controlled search + visibility filters. */
  filters: DataViewFilters;
  /** Infinite-scroll paging state. Omit to disable paging. */
  pagination?: DataViewPagination;
  /** Refetches the list (e.g. after a mutation). */
  refetch: () => void;
  /** Whether the initial query is pending. */
  isPending: boolean;
  /** Whether the query is fetching (e.g. after `refetch()`); drives the refresh skeleton. */
  isFetching?: boolean;
  /** A surfaced error message, if any. */
  error?: string | null;
}
