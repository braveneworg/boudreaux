/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import type { ReactElement } from 'react';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import { PlaylistCreatorItem, type PlaylistCreatorItemData } from './playlist-creator-item';

/** The subset of `DragEndEvent` the reorder handler reads (kept narrow for tests). */
interface DragEndLike {
  active: { id: UniqueIdentifier };
  over: { id: UniqueIdentifier } | null;
}

interface BuildDragEndHandlerArgs {
  /** Current row ids in render order. */
  itemIds: string[];
  /** Receives the full id list in its new order after a successful move. */
  onReorder: (orderedIds: string[]) => void;
}

/**
 * Builds the `DndContext` drag-end handler: maps the active/over ids onto the
 * current order with `arrayMove` and reports the moved order via `onReorder`.
 * Drops with no target, onto themselves, or with unknown ids are ignored.
 */
export const buildDragEndHandler =
  ({ itemIds, onReorder }: BuildDragEndHandlerArgs) =>
  ({ active, over }: DragEndLike): void => {
    if (!over || active.id === over.id) return;
    const oldIndex = itemIds.indexOf(String(active.id));
    const newIndex = itemIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(itemIds, oldIndex, newIndex));
  };

interface PlaylistCreatorItemListProps {
  items: PlaylistCreatorItemData[];
  /** Fired with the full id list in its new order after a drag. */
  onReorder: (orderedIds: string[]) => void;
  /** Fired with the removed row's id after its confirm dialog is accepted. */
  onRemove: (id: string) => void;
}

/**
 * Vertical drag-sortable list of the creator's items. Sensor tuning mirrors
 * `artist-pill-list.tsx`: pointer drags activate after 8px, touch drags after
 * a 200ms hold (5px tolerance), and keyboard sorting uses the standard
 * sortable coordinate getter.
 */
export const PlaylistCreatorItemList = ({
  items,
  onReorder,
  onRemove,
}: PlaylistCreatorItemListProps): ReactElement => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const itemIds = items.map(({ id }) => id);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={buildDragEndHandler({ itemIds, onReorder })}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col" aria-label="Playlist items">
          {items.map((item) => (
            <PlaylistCreatorItem key={item.id} {...item} onRemove={() => onRemove(item.id)} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
};
