/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useRef, useState } from 'react';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';

import {
  removeHeadlinerAction,
  reorderHeadlinersAction,
  updateHeadlinerSetTimeAction,
} from '@/lib/actions/tour-date-actions';

import { ArtistPill } from './artist-pill';

import type { HeadlinerWithRelations } from './artist-pill';

interface SortableArtistPillProps {
  headliner: HeadlinerWithRelations;
  index: number;
  onSetTimeUpdate: (headlinerId: string, setTime: string | null) => Promise<void>;
  onRemove: (headlinerId: string) => Promise<void>;
}

function SortableArtistPill({
  headliner,
  index,
  onSetTimeUpdate,
  onRemove,
}: SortableArtistPillProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: headliner.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <ArtistPill
        headliner={headliner}
        index={index}
        isDragging={isDragging}
        dragHandleProps={listeners}
        onSetTimeUpdate={onSetTimeUpdate}
        onRemove={onRemove}
      />
    </div>
  );
}

interface ArtistPillListProps {
  tourDateId: string;
  headliners: HeadlinerWithRelations[];
  onHeadlinersChange: () => Promise<void>;
}

export default function ArtistPillList({
  tourDateId,
  headliners: initialHeadliners,
  onHeadlinersChange,
}: ArtistPillListProps) {
  const [headliners, setHeadliners] = useState(initialHeadliners);
  const prevInitialRef = useRef(initialHeadliners);

  // Keep local state in sync with parent prop updates
  // (e.g., after the parent refetches tour dates).
  // Compare against the previous prop reference, not local state,
  // to avoid overriding optimistic updates before the parent refreshes.
  if (initialHeadliners !== prevInitialRef.current) {
    prevInitialRef.current = initialHeadliners;
    setHeadliners(initialHeadliners);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = headliners.findIndex((h) => h.id === active.id);
      const newIndex = headliners.findIndex((h) => h.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(headliners, oldIndex, newIndex);
      setHeadliners(reordered);

      const result = await reorderHeadlinersAction(
        tourDateId,
        reordered.map((h) => h.id)
      );

      if (result.success) {
        toast.success('Artist order updated');
      } else {
        // Revert on failure
        setHeadliners(headliners);
        toast.error(result.error || 'Failed to reorder artists');
      }
    },
    [headliners, tourDateId]
  );

  const handleSetTimeUpdate = useCallback(async (headlinerId: string, setTime: string | null) => {
    const result = await updateHeadlinerSetTimeAction(headlinerId, setTime);
    if (result.success) {
      toast.success('Set time updated');
      // Update local state
      setHeadliners((prev) =>
        prev.map((h) =>
          h.id === headlinerId ? { ...h, setTime: setTime ? new Date(setTime) : null } : h
        )
      );
    } else {
      toast.error(result.error || 'Failed to update set time');
    }
  }, []);

  const handleRemove = useCallback(
    async (headlinerId: string) => {
      const result = await removeHeadlinerAction(headlinerId);
      if (result.success) {
        toast.success('Artist removed from tour date');
        setHeadliners((prev) => prev.filter((h) => h.id !== headlinerId));
        await onHeadlinersChange();
      } else {
        toast.error(result.error || 'Failed to remove artist');
      }
    },
    [onHeadlinersChange]
  );

  if (headliners.length === 0) {
    return <span className="text-sm text-muted-foreground">No headliners</span>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={headliners.map((h) => h.id)} strategy={horizontalListSortingStrategy}>
        <div className="flex flex-wrap gap-2" role="list" aria-label="Headlining artists">
          {headliners.map((headliner, index) => (
            <SortableArtistPill
              key={headliner.id}
              headliner={headliner}
              index={index}
              onSetTimeUpdate={handleSetTimeUpdate}
              onRemove={handleRemove}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
