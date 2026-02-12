import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Separator } from '@radix-ui/react-separator';
import {
  ArchiveRestoreIcon,
  BookCheck,
  Eye,
  InfoIcon,
  Pencil,
  Send,
  Trash2Icon,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import type { AdminEntity } from '@/app/admin/types';
import { Button } from '@/app/components/ui/button';
import { Card } from '@/app/components/ui/card';
import {
  Dialog,
  DialogTitle,
  DialogTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogClose,
} from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Spinner } from '@/app/components/ui/spinner/spinner';
import { Switch } from '@/app/components/ui/switch';
import { TrackPlayButton } from '@/app/components/ui/track-play-button';
import { getDisplayName } from '@/lib/utils/get-display-name';
import { toDisplayLabel, toEntityUrlPath, toPascalCase } from '@/lib/utils/string-utils';

/**
 * Cleans up malformed URLs that may have duplicate protocols (e.g., https://https://)
 */
const cleanImageUrl = (url: string): string => {
  if (!url) return url;
  // Fix double https:// protocol
  return url.replace(/^https?:\/\/https?:\/\//, 'https://');
};

/**
 * A generic data view component for displaying and managing admin entities.
 *
 * @template T - The entity type extending a record with string keys and unknown values
 *
 * @param props - Component properties
 * @param props.entity - The type of admin entity being displayed
 * @param props.data - The data to display. Uses an intersection type `(T[] & Record<string, T[]>)`
 *   to satisfy two different access patterns:
 *   - Direct array access for type safety when iterating
 *   - Dynamic key access (e.g., `data['artists']` or `data['releases']`) for accessing
 *     entity-specific collections where the key is derived from the entity name at runtime.
 *   This dual typing allows the component to work generically across different entity types
 *   while maintaining type safety for both access patterns. Can be null if no data is available.
 * @param props.fieldsToShow - Array of field names from the entity to display in each card
 * @param props.router - Optional router object for navigation with a push method
 *
 * @returns A React component that renders a searchable list view with create, edit, view,
 *   publish, and delete actions for admin entities
 */
export function DataView<T extends Record<string, unknown>>({
  entity,
  data,
  fieldsToShow,
  imageField,
  coverArtField,
  refetch,
  isPending,
  error,
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
  getItemDisplayName,
}: {
  entity: AdminEntity;
  data: Record<string, T[]> | null;
  fieldsToShow: string[];
  /** Field name containing an array of images with src property */
  imageField?: string;
  /** Field name containing a direct cover art URL string */
  coverArtField?: string;
  refetch: () => void;
  isPending: boolean;
  error?: string | null;
  /** For infinite scroll - whether there are more pages to load */
  hasNextPage?: boolean;
  /** For infinite scroll - function to fetch next page */
  fetchNextPage?: () => void;
  /** For infinite scroll - whether currently fetching next page */
  isFetchingNextPage?: boolean;
  /** Custom display name resolver for entity-specific name formatting */
  getItemDisplayName?: (item: T) => string;
}) {
  const [showDeleted, setShowDeleted] = useState(false);
  const [showPublished, setShowPublished] = useState(true);
  const [showUnpublished, setShowUnpublished] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewImage, setPreviewImage] = useState<{ src: string; altText?: string } | null>(null);
  const router = useRouter();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const resolveDisplayName = useCallback(
    (item: T) => (getItemDisplayName ? getItemDisplayName(item) : getDisplayName(item)),
    [getItemDisplayName]
  );

  // Infinite scroll observer
  useEffect(() => {
    if (!hasNextPage || !fetchNextPage) return;

    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    });

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      observer.disconnect();
    };
  }, [hasNextPage, fetchNextPage, isFetchingNextPage]);

  const searchData = useMemo(() => {
    const baseData = data?.[`${String(entity)}s`] as T[];
    if (!baseData) {
      return null;
    }

    return baseData.filter((item) => {
      // Filter by deleted status
      const isDeleted = item.deletedOn !== null && item.deletedOn !== undefined;
      if (!showDeleted && isDeleted) return false;

      // Filter by published status (inclusive)
      // Note: releases use publishedAt while other entities use publishedOn
      const isPublished =
        (item.publishedOn !== null && item.publishedOn !== undefined) ||
        (item.publishedAt !== null && item.publishedAt !== undefined);
      const publishedMatch = showPublished && isPublished;
      const unpublishedMatch = showUnpublished && !isPublished;

      // If no toggle is on, don't show anything
      if (!showPublished && !showUnpublished && !showDeleted) return false;
      // If at least one toggle is on, check if item matches
      if (!publishedMatch && !unpublishedMatch && !isDeleted) return false;

      // Filter by search query
      if (searchQuery) {
        return Object.values(item).some((value) =>
          String(value).toLowerCase().includes(searchQuery.toLowerCase())
        );
      }

      return true;
    });
  }, [data, entity, showDeleted, showPublished, showUnpublished, searchQuery]);

  // Get the URL-friendly path for the entity (e.g., "featuredArtist" -> "featured-artists")
  const entityUrlPath = toEntityUrlPath(entity);

  // Get the display-friendly label for the entity (e.g., "featuredArtist" -> "featured artist")
  const entityDisplayLabel = toDisplayLabel(entity);

  const updateEntity = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      return await fetch(`/api/${entityUrlPath}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then((res) => res.json())
        .catch((error) => {
          console.error(`Failed to update ${entityDisplayLabel}:`, error);
          return { error: 'Failed to update entity' };
        });
    },
    [entityDisplayLabel, entityUrlPath]
  );

  const deleteEntity = useCallback(
    async (id: string) => {
      return await fetch(`/api/${entityUrlPath}/${id}`, {
        method: 'DELETE',
      })
        .then((res) => res.json())
        .catch((error) => {
          console.error(`Failed to delete ${entityDisplayLabel}:`, error);
          return { error: 'Failed to delete entity' };
        });
    },
    [entityDisplayLabel, entityUrlPath]
  );

  // Check if entity supports soft delete by checking if first item has deletedOn property
  const supportsSoftDelete = useMemo(() => {
    const baseData = data?.[`${String(entity)}s`] as T[];
    if (!baseData || baseData.length === 0) return true; // Default to soft delete for empty data
    // Check if 'deletedOn' exists in the first item (including if it's null)
    return 'deletedOn' in baseData[0];
  }, [data, entity]);

  const handleCreateEntityButtonClick = () => {
    router?.push(`/admin/${entityUrlPath}`);
  };

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleClickPublishButton = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      const { id } = (event.currentTarget as HTMLButtonElement).dataset;

      if (id) {
        // Releases use 'publishedAt', other entities use 'publishedOn'
        const publishField = entity === 'release' ? 'publishedAt' : 'publishedOn';
        const response = await updateEntity(id, {
          [publishField]: new Date().toISOString(),
        });

        if (response.id) {
          const displayName = resolveDisplayName(response as T);
          toast.success(`Successfully published ${entityDisplayLabel} - ${displayName}`);
          refetch();
        } else {
          toast.error(
            `Failed to publish ${entityDisplayLabel}: ${response.error || 'Unknown error'}`
          );
        }
      } else {
        toast.error(`Failed to publish: Missing ${entityDisplayLabel} ID`);
      }
    },
    [entity, entityDisplayLabel, updateEntity, refetch, resolveDisplayName]
  );

  const handleClickDeleteButton = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      const { id } = (event.currentTarget as HTMLButtonElement).dataset;
      if (id) {
        // Use hard delete for entities that don't support soft delete (like Release)
        if (!supportsSoftDelete) {
          const response = await deleteEntity(id);

          if (response.message || !response.error) {
            toast.success(`Successfully deleted ${entityDisplayLabel}`);
            refetch();
          } else {
            toast.error(
              `Failed to delete ${entityDisplayLabel}: ${response.error || 'Unknown error'}`
            );
          }
        } else {
          // Use soft delete for entities that support it
          const response = await updateEntity(id, {
            deletedOn: new Date().toISOString(),
          });

          if (response.id) {
            toast.success(
              `Successfully deleted ${entityDisplayLabel} - ${resolveDisplayName(response as T)}`
            );
            refetch();
          } else {
            toast.error(
              `Failed to delete ${entityDisplayLabel}: ${response.error || 'Unknown error'}`
            );
          }
        }
      } else {
        toast.error(`Failed to delete: Missing ${entityDisplayLabel} ID`);
      }
    },
    [
      entityDisplayLabel,
      updateEntity,
      deleteEntity,
      refetch,
      supportsSoftDelete,
      resolveDisplayName,
    ]
  );

  const handleClickRestoreButton = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      const { id } = (event.currentTarget as HTMLButtonElement).dataset;
      if (id) {
        const response = await updateEntity(id, { deletedOn: null });
        if (response.id) {
          toast.success(
            `Successfully restored ${entityDisplayLabel} - ${resolveDisplayName(response as T)}`
          );
          refetch();
        } else {
          toast.error(
            `Failed to restore ${entityDisplayLabel}: ${response.error || 'Unknown error'}`
          );
        }
      } else {
        toast.error(`Failed to restore: Missing ${entityDisplayLabel} ID`);
      }
    },
    [entityDisplayLabel, updateEntity, refetch, resolveDisplayName]
  );

  return (
    <>
      <Button
        className="w-full"
        onClick={handleCreateEntityButtonClick}
      >{`Create ${entityDisplayLabel}`}</Button>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      <Input
        className="w-full my-4"
        type="search"
        onChange={handleSearchChange}
        placeholder={`Search ${entityDisplayLabel}s...`}
      />
      {supportsSoftDelete && (
        <div className="flex items-center gap-2 mb-2">
          <Switch id="show-deleted" checked={showDeleted} onCheckedChange={setShowDeleted} />
          <Label htmlFor="show-deleted" className="cursor-pointer">
            Show deleted
          </Label>
        </div>
      )}
      <div className="flex items-center gap-2 mb-2">
        <Switch id="show-published" checked={showPublished} onCheckedChange={setShowPublished} />
        <Label htmlFor="show-published" className="cursor-pointer">
          Show published
        </Label>
      </div>
      <div className="flex items-center gap-2 mb-4">
        <Switch
          id="show-unpublished"
          checked={showUnpublished}
          onCheckedChange={setShowUnpublished}
        />
        <Label htmlFor="show-unpublished" className="cursor-pointer">
          Show unpublished
        </Label>
      </div>
      {data && (data[`${entity}s`] as T[]).length > 0 ? (
        <>
          <ul>
            {((searchData ?? data[`${String(entity)}s`]) as T[]).map((item) => {
              const id = item.id as string;

              return (
                <li key={id}>
                  <Card>
                    {/* Image thumbnails */}
                    {(() => {
                      // First check for direct coverArt URL field
                      let coverArtUrl = coverArtField
                        ? (item[coverArtField] as string | undefined)
                        : undefined;

                      // Fallback: check releaseTracks for coverArt (for tracks)
                      if (!coverArtUrl && item.releaseTracks) {
                        const releaseTracks = item.releaseTracks as Array<{
                          coverArt?: string;
                        }>;
                        coverArtUrl = releaseTracks[0]?.coverArt;
                      }

                      // Then check for images array
                      const images = imageField
                        ? (item[imageField] as
                            | Array<{ src?: string; altText?: string }>
                            | undefined)
                        : undefined;

                      // If we have a direct cover art URL, show it
                      if (coverArtUrl) {
                        const isBase64 = coverArtUrl.startsWith('data:');
                        return (
                          <div className="mb-3 flex justify-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewImage({ src: coverArtUrl!, altText: 'Cover art' })
                              }
                              className="group relative h-16 w-16 overflow-hidden rounded-md border bg-muted transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                            >
                              {isBase64 ? (
                                // Use native img for base64 data URLs
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={coverArtUrl}
                                  alt="Cover art"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Image
                                  src={cleanImageUrl(coverArtUrl!)}
                                  alt="Cover art"
                                  fill
                                  className="object-cover"
                                  sizes="64px"
                                />
                              )}
                              <span className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-70 transition-opacity group-hover:opacity-100">
                                <Eye className="h-3 w-3" />
                              </span>
                            </button>
                          </div>
                        );
                      }

                      // If we have images array, show those
                      if (images && images.length > 0) {
                        return (
                          <div className="mb-3 flex justify-center gap-2">
                            {images.slice(0, 3).map((image) =>
                              image.src ? (
                                <button
                                  key={image.src}
                                  type="button"
                                  onClick={() =>
                                    setPreviewImage(image as { src: string; altText?: string })
                                  }
                                  className="group relative h-16 w-16 overflow-hidden rounded-md border bg-muted transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                                >
                                  <Image
                                    src={cleanImageUrl(image.src)}
                                    alt={image.altText || `${entity} image`}
                                    fill
                                    className="object-cover"
                                    sizes="64px"
                                  />
                                  <span className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-70 transition-opacity group-hover:opacity-100">
                                    <Eye className="h-3 w-3" />
                                  </span>
                                </button>
                              ) : null
                            )}
                          </div>
                        );
                      }

                      return null;
                    })()}
                    <div className="flex flex-row justify-center gap-2 items-center mb-2">
                      <InfoIcon className="h-4 w-4" />
                      <Link href={`/admin/${entityUrlPath}/${id}`}>View more info</Link>
                    </div>
                    <Separator className="border-[0.5px] mt-0 mb-2 border-zinc-300" />
                    {fieldsToShow.map((field: string, index: number) => {
                      if (field.endsWith('At') || field.endsWith('On')) {
                        const dateValue = item[field] ? new Date(item[field] as string) : null;
                        /**
                         * The formatted date string in locale-specific format (M/D/YYYY).
                         * Uses the default locale with numeric representation for year, month, and day.
                         * Returns '-' if dateValue is null/undefined.
                         *
                         * Note: 'default' is a valid locale argument that uses the runtime's default locale,
                         * though it's often clearer to use `undefined` or explicitly specify a locale like 'en-US'.
                         */
                        const formattedDate = dateValue
                          ? dateValue.toLocaleDateString('default', {
                              year: 'numeric',
                              month: 'numeric',
                              day: 'numeric',
                            })
                          : '-';
                        return (
                          <span className="ml-2 leading-7" key={`${field}-${index + 1}`}>
                            <b>
                              {toPascalCase(field)
                                .split(/(?=[A-Z])/)
                                .join(' ')}
                            </b>
                            : <span>{formattedDate}</span>
                          </span>
                        );
                      }

                      return (
                        <span className="ml-2 leading-7" key={`${field}-${index + 1}`}>
                          <b>
                            {toPascalCase(field)
                              .split(/(?=[A-Z])/)
                              .join(' ')}
                          </b>
                          : <span>{String(item[field] ?? '-')}</span>
                        </span>
                      );
                    })}
                    <Separator className="border-[0.5px] mt-2 mb-4 border-zinc-400" />
                    <div className="flex gap-2 justify-end items-center mr-2">
                      {entity === 'track' && !!(item as Record<string, unknown>).audioUrl && (
                        <TrackPlayButton
                          audioUrl={(item as Record<string, unknown>).audioUrl as string}
                          size="default"
                        />
                      )}
                      <Button asChild variant="outline">
                        <Link href={`/admin/${entityUrlPath}/${id}`}>
                          <Pencil className="mr-2 size-4" />
                          Edit
                        </Link>
                      </Button>
                      {((): ReactElement => {
                        // Check if item is published (releases use publishedAt, others use publishedOn)
                        const isPublished = !!(item.publishedAt || item.publishedOn);
                        return (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button disabled={isPublished}>
                                {isPublished ? (
                                  <BookCheck className="mr-0 size-4" />
                                ) : (
                                  <Send className="mr-0 size-4" />
                                )}
                                {isPublished ? 'Published' : 'Publish'}
                                {isPending && <Spinner className="mr-2 size-4" />}
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <section>
                                <DialogHeader>
                                  <DialogTitle asChild>
                                    <h1 className="text-3xl!">Confirm Publish</h1>
                                  </DialogTitle>
                                </DialogHeader>
                                <p className="mt-1 mb-4">
                                  Are you sure you want to publish <b>{resolveDisplayName(item)}</b>
                                  ?
                                </p>
                                <DialogFooter>
                                  <DialogClose asChild>
                                    <Button variant="secondary">Cancel</Button>
                                  </DialogClose>
                                  <DialogClose asChild>
                                    <Button
                                      variant="destructive"
                                      onClick={handleClickPublishButton}
                                      datasetId={id}
                                    >
                                      Confirm
                                    </Button>
                                  </DialogClose>
                                </DialogFooter>
                              </section>
                            </DialogContent>
                          </Dialog>
                        );
                      })()}
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant={
                              supportsSoftDelete && item.deletedOn ? 'secondary' : 'destructive'
                            }
                          >
                            {supportsSoftDelete && item.deletedOn ? (
                              <ArchiveRestoreIcon className="mr-0 size-4" />
                            ) : (
                              <Trash2Icon className="mr-0 size-4" />
                            )}
                            {supportsSoftDelete && item.deletedOn ? 'Restore' : 'Delete'}
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <section>
                            <DialogHeader>
                              <DialogTitle asChild>
                                {supportsSoftDelete && item.deletedOn ? (
                                  <h1 className="text-3xl!">Confirm Restore</h1>
                                ) : (
                                  <h1 className="text-3xl!">Confirm Delete</h1>
                                )}
                              </DialogTitle>
                            </DialogHeader>
                            <p className="mt-1 mb-4">
                              Are you sure you want to{' '}
                              {supportsSoftDelete && item.deletedOn ? 'restore' : 'delete'}{' '}
                              <b>{resolveDisplayName(item)}</b>?
                            </p>
                            <DialogFooter>
                              <DialogClose asChild>
                                <Button variant="secondary">Cancel</Button>
                              </DialogClose>
                              <DialogClose asChild>
                                <Button
                                  variant={
                                    supportsSoftDelete && item.deletedOn ? 'default' : 'destructive'
                                  }
                                  onClick={
                                    supportsSoftDelete && item.deletedOn
                                      ? handleClickRestoreButton
                                      : handleClickDeleteButton
                                  }
                                  datasetId={id}
                                >
                                  Confirm
                                </Button>
                              </DialogClose>
                            </DialogFooter>
                          </section>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
          {/* Infinite scroll load more trigger */}
          {fetchNextPage && (
            <div
              ref={loadMoreRef}
              className="flex flex-col items-center justify-center gap-2 py-6 min-h-15"
            >
              {isFetchingNextPage ? (
                <div className="flex items-center gap-2">
                  <Spinner className="size-4" />
                  <span className="text-sm text-muted-foreground">Loading more...</span>
                </div>
              ) : hasNextPage ? (
                <Button variant="outline" size="sm" onClick={() => fetchNextPage()}>
                  Load More
                </Button>
              ) : (
                <span className="text-sm text-muted-foreground">All items loaded</span>
              )}
            </div>
          )}
        </>
      ) : (
        <p>No data available</p>
      )}

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-h-[90vh] max-w-[90vw] overflow-hidden p-0 sm:max-w-3xl">
          <DialogTitle className="sr-only">{previewImage?.altText || 'Image preview'}</DialogTitle>
          {previewImage && (
            <div className="relative aspect-auto max-h-[85vh] w-full">
              {previewImage.src.startsWith('data:') ? (
                // Use native img for base64 data URLs
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewImage.src}
                  alt={previewImage.altText || 'Image preview'}
                  className="h-auto max-h-[85vh] w-full object-contain"
                />
              ) : (
                <Image
                  src={cleanImageUrl(previewImage.src)}
                  alt={previewImage.altText || 'Image preview'}
                  width={1200}
                  height={800}
                  className="h-auto max-h-[85vh] w-full object-contain"
                />
              )}
            </div>
          )}
          <DialogClose className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm hover:bg-background">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </>
  );
}
