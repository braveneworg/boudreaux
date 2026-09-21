/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import React, { useId, useState } from 'react';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronsUpDown, GripVertical } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/app/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { RemovablePill } from '@/app/components/ui/removable-pill';
import { useDebounce } from '@/hooks/use-debounce';
import type { ArtistVocabularyEntry, ArtistVocabularyField } from '@/lib/types/domain/artist';
import { formatVocabularyTerm, normalizeVocabularyTerm } from '@/utils/vocabulary-term';

import { useArtistVocabularyQuery } from '../_hooks/use-artist-vocabulary-query';

// --------------------------------------------------------------------------
// Public types
// --------------------------------------------------------------------------

export interface VocabularyMultiComboboxProps {
  /** Which vocabulary the suggestions come from. */
  field: ArtistVocabularyField;
  /** Current terms, already normalised. */
  value: string[];
  /** Replaces the whole ordered list. */
  onChange: (next: string[]) => void;
  /** Visible label; also names the pill list for assistive technology. */
  label: string;
  /** Extra guidance under the control. */
  helperText?: string;
  /** Pills past this position render muted. Omit to mute none. */
  highlightCount?: number;
  disabled?: boolean;
}

/** Plural noun used in the placeholder and the list label. */
const fieldNoun = (field: ArtistVocabularyField): string => {
  switch (field) {
    case 'genres':
      return 'genres';
    case 'tags':
      return 'tags';
  }
};

// --------------------------------------------------------------------------
// Sub-components (extracted to keep the main component under complexity:10)
// --------------------------------------------------------------------------

interface TriggerLabelProps {
  count: number;
  noun: string;
}

const TriggerLabel = ({ count, noun }: TriggerLabelProps): React.ReactElement => (
  <>
    <span className="truncate">
      {count === 0 ? `Add ${noun}…` : `${count} selected — add another…`}
    </span>
    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
  </>
);

interface ResultsListProps {
  isPending: boolean;
  results: ArtistVocabularyEntry[];
  search: string;
  noun: string;
  onSelect: (term: string) => void;
}

const ResultsList = ({
  isPending,
  results,
  search,
  noun,
  onSelect,
}: ResultsListProps): React.ReactElement => {
  const trimmed = search.trim();
  const normalized = normalizeVocabularyTerm(trimmed);
  const hasExactMatch = results.some((entry) => entry.value === normalized);
  const showAddNew = normalized.length > 0 && !hasExactMatch;

  if (isPending) {
    return (
      <CommandList>
        <CommandEmpty>Loading…</CommandEmpty>
      </CommandList>
    );
  }

  return (
    <CommandList style={{ maxHeight: 'var(--radix-popover-content-available-height)' }}>
      <CommandEmpty>{`No ${noun} found.`}</CommandEmpty>
      <CommandGroup>
        {results.map((entry) => (
          <CommandItem key={entry.value} value={entry.value} onSelect={() => onSelect(entry.value)}>
            <span className="flex w-full items-center justify-between gap-2">
              <span>{formatVocabularyTerm(entry.value)}</span>
              <span className="text-muted-foreground text-xs tabular-nums">{entry.count}</span>
            </span>
          </CommandItem>
        ))}
        {showAddNew && (
          <CommandItem value={`__add__${normalized}`} onSelect={() => onSelect(normalized)}>
            {`Add "${trimmed}"`}
          </CommandItem>
        )}
      </CommandGroup>
    </CommandList>
  );
};

interface SortablePillProps {
  term: string;
  muted: boolean;
  disabled: boolean;
  onRemove: (term: string) => void;
}

const SortablePill = ({ term, muted, disabled, onRemove }: SortablePillProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: term,
  });
  const label = formatVocabularyTerm(term);

  return (
    <span
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
      }}
      role="listitem"
    >
      <RemovablePill
        data-testid={`pill-${term}`}
        label={label}
        muted={muted}
        disabled={disabled}
        onRemove={() => onRemove(term)}
        leading={
          <button
            type="button"
            className="cursor-grab touch-none"
            aria-label={`Reorder ${label}`}
            disabled={disabled}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3 w-3 opacity-60" />
          </button>
        }
      />
    </span>
  );
};

// --------------------------------------------------------------------------
// Main component
// --------------------------------------------------------------------------

/**
 * Combobox + removable, drag-reorderable pills over one normalised vocabulary
 * (genres or tags).
 *
 * Suggestions are usage-ranked terms already on the roster, with their counts;
 * free text is always addable and is normalised on the way in, so the stored
 * value never depends on how it was typed. Reordering only calls `onChange` —
 * nothing persists until the form is saved.
 *
 * @param props - See {@link VocabularyMultiComboboxProps}.
 */
export const VocabularyMultiCombobox = ({
  field,
  value,
  onChange,
  label,
  helperText,
  highlightCount,
  disabled = false,
}: VocabularyMultiComboboxProps): React.ReactElement => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerId = useId();
  const noun = fieldNoun(field);

  const debounced = useDebounce(search, 300);
  const { isPending, data } = useArtistVocabularyQuery(field, debounced, { enabled: open });
  const results = data ?? [];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // No onKeyDown here: cmdk already selects the highlighted item on Enter, and
  // the `Add "<x>"` entry is part of that list. A handler that ALSO added the
  // typed text made Enter add two terms — the typed one and whichever
  // suggestion happened to be highlighted.
  const addTerm = (term: string): void => {
    const normalized = normalizeVocabularyTerm(term);
    if (normalized === '' || value.includes(normalized)) return;
    onChange([...value, normalized]);
    setSearch('');
  };

  const removeTerm = (term: string): void => {
    onChange(value.filter((existing) => existing !== term));
  };

  const handleOpenChange = (next: boolean): void => {
    setOpen(next);
    if (!next) setSearch('');
  };

  const handleDragEnd = ({ active, over }: DragEndEvent): void => {
    if (!over || active.id === over.id) return;
    const from = value.indexOf(String(active.id));
    const to = value.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onChange(arrayMove(value, from, to));
  };

  return (
    <div className="space-y-2">
      <label htmlFor={triggerId} className="text-sm font-medium">
        {label}
      </label>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            id={triggerId}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled}
          >
            <TriggerLabel count={value.length} noun={noun} />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[calc(100vw-2rem)] p-0 sm:w-[400px]"
          align="start"
          avoidCollisions
          collisionPadding={8}
          sideOffset={4}
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={`Search ${noun}…`}
              value={search}
              onValueChange={setSearch}
            />
            <ResultsList
              isPending={isPending}
              results={results}
              search={search}
              noun={noun}
              onSelect={addTerm}
            />
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={value} strategy={horizontalListSortingStrategy}>
            <div className="flex flex-wrap gap-2" role="list" aria-label={`Selected ${noun}`}>
              {value.map((term, index) => (
                <SortablePill
                  key={term}
                  term={term}
                  muted={highlightCount !== undefined && index >= highlightCount}
                  disabled={disabled}
                  onRemove={removeTerm}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {highlightCount !== undefined && (
        <p className="text-muted-foreground text-xs">
          {`The first ${highlightCount} appear on artist cards.`}
        </p>
      )}
      {helperText && <p className="text-muted-foreground text-xs">{helperText}</p>}
    </div>
  );
};
