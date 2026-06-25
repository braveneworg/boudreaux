/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { DndContext, closestCenter, type DragEndEvent, type useSensors } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';

import { cn } from '@/lib/utils';

import { SortableImageItem } from './sortable-image-item';

import type { ImageItem } from './image-uploader-types';

interface ImageUploaderGridProps {
  images: ImageItem[];
  sensors: ReturnType<typeof useSensors>;
  isReordering: boolean;
  isDisabled: boolean;
  onDragEnd: (event: DragEndEvent) => Promise<void>;
  onDeleteRequest: (item: ImageItem) => void;
  onPreview: (item: ImageItem) => void;
}

/**
 * The drag-and-drop sortable grid of image thumbnails. Renders nothing when
 * there are no images. Reordering is suspended (drag handler detached, grid
 * dimmed/non-interactive) while a reorder is being persisted.
 */
export const ImageUploaderGrid = ({
  images,
  sensors,
  isReordering,
  isDisabled,
  onDragEnd,
  onDeleteRequest,
  onPreview,
}: ImageUploaderGridProps): React.JSX.Element | null => {
  if (images.length === 0) return null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={isReordering ? undefined : onDragEnd}
    >
      <SortableContext items={images.map((i) => i.id)} strategy={rectSortingStrategy}>
        <div
          className={cn(
            'grid grid-cols-3 gap-2 p-1 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6',
            isReordering && 'pointer-events-none opacity-50'
          )}
        >
          {images.map((item) => (
            <SortableImageItem
              key={item.id}
              item={item}
              onDeleteRequest={onDeleteRequest}
              onPreview={onPreview}
              disabled={isDisabled}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
