/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ReactElement } from 'react';

import Link from 'next/link';

import { Separator } from '@radix-ui/react-separator';
import { InfoIcon, Pencil } from 'lucide-react';

import type { AdminEntity } from '@/app/admin/types';
import { Button } from '@/app/components/ui/button';
import { Card } from '@/app/components/ui/card';

import { DeleteRestoreEntityDialog } from './delete-restore-entity-dialog';
import { EntityFieldList } from './entity-field-list';
import { EntityThumbnails } from './entity-thumbnails';
import { PublishEntityDialog } from './publish-entity-dialog';

interface DataViewCardProps<T extends Record<string, unknown>> {
  item: T;
  entity: AdminEntity;
  /** URL-friendly entity path, e.g. "featured-artists". */
  entityUrlPath: string;
  fieldsToShow: string[];
  imageField?: string;
  coverArtField?: string;
  /** Whether a publish mutation is in flight. */
  isPending: boolean;
  /** Whether the entity supports soft delete. */
  supportsSoftDelete: boolean;
  /** Whether a restore handler is wired (soft-delete-only entities). */
  canRestore: boolean;
  resolveDisplayName: (item: T) => string;
  onPublish: (item: T) => void;
  onDelete: (item: T) => void;
  onRestore: (item: T) => void;
}

/** A single entity row: thumbnails, info link, fields, and edit/publish/delete actions. */
export const DataViewCard = <T extends Record<string, unknown>>({
  item,
  entity,
  entityUrlPath,
  fieldsToShow,
  imageField,
  coverArtField,
  isPending,
  supportsSoftDelete,
  canRestore,
  resolveDisplayName,
  onPublish,
  onDelete,
  onRestore,
}: DataViewCardProps<T>): ReactElement => {
  const id = item.id as string;
  const displayName = resolveDisplayName(item);
  // Releases use publishedAt; other entities use publishedOn.
  const isPublished = !!(item.publishedAt || item.publishedOn);
  // Offer Restore only when the entity is soft-deletable, this row is currently
  // deleted, AND a restore handler is wired — otherwise fall back to Delete so the
  // action can never silently no-op.
  const showRestore = supportsSoftDelete && !!item.deletedOn && canRestore;

  return (
    <Card>
      <EntityThumbnails
        item={item}
        entity={entity}
        imageField={imageField}
        coverArtField={coverArtField}
      />
      <div className="mb-2 flex flex-row items-center justify-center gap-2">
        <InfoIcon className="h-4 w-4" />
        <Link href={`/admin/${entityUrlPath}/${id}`}>View more info</Link>
      </div>
      <Separator className="mt-0 mb-2 border-[0.5px] border-zinc-300" />
      <EntityFieldList
        item={item}
        fieldsToShow={fieldsToShow}
        resolveDisplayName={resolveDisplayName}
      />
      <Separator className="mt-2 mb-4 border-[0.5px] border-zinc-400" />
      <div className="flex items-center justify-center gap-2">
        <Button asChild variant="outline">
          <Link href={`/admin/${entityUrlPath}/${id}`}>
            <Pencil className="mr-2 size-4" />
            Edit
          </Link>
        </Button>
        <PublishEntityDialog
          displayName={displayName}
          isPublished={isPublished}
          isPending={isPending}
          onConfirm={() => onPublish(item)}
        />
        <DeleteRestoreEntityDialog
          showRestore={showRestore}
          displayName={displayName}
          onConfirm={() => (showRestore ? onRestore(item) : onDelete(item))}
        />
      </div>
    </Card>
  );
};
