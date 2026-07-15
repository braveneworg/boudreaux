/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import React, { useState } from 'react';

import { ChevronsUpDown, X } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
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
import { useArtistListQuery } from '@/app/hooks/use-artist-list-query';
import { useDebounce } from '@/app/hooks/use-debounce';

// --------------------------------------------------------------------------
// Public types
// --------------------------------------------------------------------------

export interface FeaturedArtistsComboboxProps {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  label?: string;
}

// --------------------------------------------------------------------------
// Internal types
// --------------------------------------------------------------------------

interface ArtistRow {
  id: string;
  displayName: string | null;
  firstName: string | null;
  surname: string;
  slug: string;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

const buildArtistListParams = (
  debouncedSearch: string
): { search: string | undefined; take: number | undefined } => ({
  search: debouncedSearch || undefined,
  take: debouncedSearch ? undefined : 5,
});

const getArtistDisplayName = (artist: ArtistRow): string => {
  if (artist.displayName) return artist.displayName;
  const parts = [artist.firstName, artist.surname].filter(Boolean);
  return parts.join(' ') || '(no name)';
};

// --------------------------------------------------------------------------
// Sub-components (extracted to keep main component under ESLint complexity:10)
// --------------------------------------------------------------------------

interface TriggerLabelProps {
  count: number;
}

const TriggerLabel = ({ count }: TriggerLabelProps): React.ReactElement => (
  <>
    {count > 0
      ? `${count} featured artist${count === 1 ? '' : 's'} selected`
      : 'Search featured artists…'}
    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
  </>
);

interface ResultsListProps {
  isPending: boolean;
  artists: ArtistRow[];
  search: string;
  onSelect: (name: string) => void;
}

const ResultsList = ({
  isPending,
  artists,
  search,
  onSelect,
}: ResultsListProps): React.ReactElement => {
  const trimmed = search.trim();
  const hasExactMatch = artists.some(
    (a) => getArtistDisplayName(a).toLowerCase() === trimmed.toLowerCase()
  );
  const showAddNew = trimmed.length > 0 && !hasExactMatch;

  if (isPending) {
    return (
      <CommandList>
        <CommandEmpty>Loading…</CommandEmpty>
      </CommandList>
    );
  }

  return (
    <CommandList style={{ maxHeight: 'var(--radix-popover-content-available-height)' }}>
      <CommandEmpty>No artists found.</CommandEmpty>
      <CommandGroup>
        {artists.map((artist) => {
          const name = getArtistDisplayName(artist);
          return (
            <CommandItem key={artist.id} value={artist.id} onSelect={() => onSelect(name)}>
              {name}
            </CommandItem>
          );
        })}
        {showAddNew && (
          <CommandItem value={`__add__${trimmed}`} onSelect={() => onSelect(trimmed)}>
            {`Add "${trimmed}"`}
          </CommandItem>
        )}
      </CommandGroup>
    </CommandList>
  );
};

interface PillsListProps {
  names: string[];
  disabled: boolean;
  onRemove: (name: string) => void;
}

const PillsList = ({ names, disabled, onRemove }: PillsListProps): React.ReactElement => (
  <div className="flex flex-wrap gap-2" role="list" aria-label="Selected featured artists">
    {names.map((name) => (
      <span key={name} role="listitem" className="flex items-center gap-1">
        <Badge variant="secondary" className="gap-1">
          {name}
          <button
            type="button"
            className="hover:bg-muted-foreground/20 ml-1"
            disabled={disabled}
            aria-label={`Remove ${name}`}
            onClick={() => onRemove(name)}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      </span>
    ))}
  </div>
);

// --------------------------------------------------------------------------
// Main component
// --------------------------------------------------------------------------

export const FeaturedArtistsCombobox = ({
  value,
  onChange,
  label,
  disabled = false,
}: FeaturedArtistsComboboxProps): React.ReactElement => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const debounced = useDebounce(search, 300);
  const { isPending, data } = useArtistListQuery(buildArtistListParams(debounced), {
    enabled: open,
  });
  const artists: ArtistRow[] = data ?? [];

  const currentNames = new Set(value.map((n) => n.toLowerCase()));

  const addName = (name: string): void => {
    if (currentNames.has(name.toLowerCase())) return;
    onChange([...value, name]);
  };

  const removeName = (name: string): void => {
    onChange(value.filter((n) => n !== name));
  };

  const handleOpenChange = (next: boolean): void => {
    setOpen(next);
    if (!next) setSearch('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'Enter') return;
    const trimmed = search.trim();
    if (trimmed.length === 0) return;
    const matched = artists.find(
      (a) => getArtistDisplayName(a).toLowerCase() === trimmed.toLowerCase()
    );
    addName(matched ? getArtistDisplayName(matched) : trimmed);
  };

  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-medium">{label}</label>}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled}
          >
            <TriggerLabel count={value.length} />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[calc(100vw-2rem)] p-0 sm:w-[400px]"
          align="start"
          avoidCollisions
          collisionPadding={8}
          sideOffset={4}
          onEscapeKeyDown={(e) => e.stopPropagation()}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search featured artists…"
              value={search}
              onValueChange={setSearch}
              onKeyDown={handleKeyDown}
            />
            <ResultsList
              isPending={isPending}
              artists={artists}
              search={search}
              onSelect={addName}
            />
          </Command>
        </PopoverContent>
      </Popover>

      {disabled && <p className="text-muted-foreground text-sm">Add a primary artist first</p>}

      {value.length > 0 && <PillsList names={value} disabled={disabled} onRemove={removeName} />}
    </div>
  );
};
