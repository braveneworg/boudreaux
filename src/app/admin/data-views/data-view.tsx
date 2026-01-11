import { useCallback, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Separator } from '@radix-ui/react-separator';
import { ArchiveRestoreIcon, BookCheck, InfoIcon, Pencil, Send, Trash2Icon } from 'lucide-react';
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
import VerticalSeparator from '@/app/components/ui/vertical-separator';
import { getDisplayName } from '@/lib/utils/get-display-name';
import { toPascalCase } from '@/lib/utils/string-utils';

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
  refetch,
  isPending,
  error,
}: {
  entity: AdminEntity;
  data: Record<string, T[]> | null;
  fieldsToShow: string[];
  refetch: () => void;
  isPending: boolean;
  error?: string | null;
}) {
  const [showDeleted, setShowDeleted] = useState(false);
  const [showPublished, setShowPublished] = useState(true);
  const [showUnpublished, setShowUnpublished] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

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
      const isPublished = item.publishedOn !== null && item.publishedOn !== undefined;
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

  const fetchEntity = useCallback(
    async (body: Record<string, unknown>) => {
      return await fetch(`/api/${entity}s/`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then((res) => res.json())
        .catch((error) => {
          console.error(`Failed to fetch ${entity}:`, error);
          return { error: 'Failed to fetch entity' };
        });
    },
    [entity]
  );

  const handleCreateEntityButtonClick = () => {
    router?.push(`/admin/${entity}s`);
  };

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleClickPublishButton = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      const { id } = (event.currentTarget as HTMLButtonElement).dataset;

      if (id) {
        const response = await fetchEntity({
          isActive: true,
          publishedOn: new Date().toISOString(),
        });

        if (response.id) {
          toast.success(
            `Successfully published ${entity} - ${response.displayName || `${response.firstName} ${response.surname}`}`
          );
          refetch();
        } else {
          toast.error(`Failed to publish ${entity} - ${id}: ${response.error}`);
        }
      } else {
        toast.error(`Failed to publish: Missing ${entity} ID - ${id}`);
      }
    },
    [entity, fetchEntity, refetch]
  );

  const handleClickDeleteButton = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      const { id } = (event.currentTarget as HTMLButtonElement).dataset;
      if (id) {
        const response = await fetchEntity({
          isActive: false,
          deletedOn: new Date().toISOString(),
        });

        if (response.id) {
          toast.success(
            `Successfully deleted ${entity} - ${response.displayName || `${response.firstName} ${response.surname}`}`
          );
          refetch();
        } else {
          toast.error(`Failed to delete ${entity} - ${id}: ${response.error}`);
        }
      } else {
        toast.error(`Failed to delete: Missing ${entity} ID - ${id}`);
      }
    },
    [entity, fetchEntity, refetch]
  );

  const handleClickRestoreButton = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      const { id } = (event.currentTarget as HTMLButtonElement).dataset;
      if (id) {
        const response = await fetchEntity({ isActive: true, deletedOn: null });
        if (response.id) {
          // Add more properties to display in the abscense of displayName
          toast.success(
            `Successfully restored ${entity} - ${response.displayName || `${response.firstName} ${response.surname}`}`
          );
          refetch();
        } else {
          toast.error(`Failed to restore ${entity} - ${id}: ${response.error}`);
        }
      } else {
        toast.error(`Failed to restore: Missing ${entity} ID - ${id}`);
      }
    },
    [entity, fetchEntity, refetch]
  );

  return (
    <>
      <Button
        className="w-full"
        onClick={handleCreateEntityButtonClick}
      >{`Create ${entity}`}</Button>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      <Input
        className="w-full my-4"
        type="search"
        onChange={handleSearchChange}
        placeholder={`Search ${entity}s...`}
      />
      <div className="flex items-center gap-2 mb-2">
        <Switch id="show-deleted" checked={showDeleted} onCheckedChange={setShowDeleted} />
        <Label htmlFor="show-deleted" className="cursor-pointer">
          Show deleted
        </Label>
      </div>
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
                    <div className="flex flex-row justify-center gap-2 items-center mb-2">
                      <Pencil className="h-4 w-4" />
                      <Link href={`/admin/${entity}s/${id}?edit=true`}>
                        Edit {getDisplayName(item)}
                      </Link>
                      <VerticalSeparator className="h-4! border-[0.5px] border-zinc-300" />
                      <InfoIcon className="h-4 w-4" />
                      <Link href={`/admin/${entity}s/${id}`}>View more info</Link>
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
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button disabled={!!item.publishedOn}>
                            {item.publishedOn ? (
                              <BookCheck className="mr-0 size-4" />
                            ) : (
                              <Send className="mr-0 size-4" />
                            )}
                            {item.publishedOn ? 'Published' : 'Publish'}
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
                              Are you sure you want to publish <b>{getDisplayName(item)}</b>?
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
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant={item.deletedOn ? 'secondary' : 'destructive'}>
                            {item.deletedOn ? (
                              <ArchiveRestoreIcon className="mr-0 size-4" />
                            ) : (
                              <Trash2Icon className="mr-0 size-4" />
                            )}
                            {item.deletedOn ? 'Restore' : 'Delete'}
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <section>
                            <DialogHeader>
                              <DialogTitle asChild>
                                {item.deletedOn ? (
                                  <h1 className="text-3xl!">Confirm Restore</h1>
                                ) : (
                                  <h1 className="text-3xl!">Confirm Delete</h1>
                                )}
                              </DialogTitle>
                            </DialogHeader>
                            <p className="mt-1 mb-4">
                              Are you sure you want to {item.deletedOn ? 'restore' : 'delete'}{' '}
                              <b>{getDisplayName(item)}</b>?
                            </p>
                            <DialogFooter>
                              <DialogClose asChild>
                                <Button variant="secondary">Cancel</Button>
                              </DialogClose>
                              <DialogClose asChild>
                                <Button
                                  variant={item.deletedOn ? 'default' : 'destructive'}
                                  onClick={
                                    item.deletedOn
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
        </>
      ) : (
        <p>No data available</p>
      )}
    </>
  );
}
