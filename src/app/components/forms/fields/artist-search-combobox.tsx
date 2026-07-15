/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import React, { useId, useState } from 'react';

import { ChevronsUpDown } from 'lucide-react';

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

import { buildArtistListParams, getArtistDisplayName } from './artist-combobox-helpers';

import type { ArtistRow } from './artist-combobox-helpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArtistSearchComboboxProps {
  value: string;
  onChange: (name: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Sub-components (keep main component under ESLint complexity:10)
// ---------------------------------------------------------------------------

interface TriggerLabelProps {
  value: string;
  placeholder: string;
}

const TriggerLabel = ({ value, placeholder }: TriggerLabelProps): React.ReactElement => (
  <>
    {value || placeholder}
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
  const showUseItem = trimmed.length > 0 && !hasExactMatch;

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
        {showUseItem && (
          <CommandItem value={`__use__${trimmed}`} onSelect={() => onSelect(trimmed)}>
            {`Use "${trimmed}"`}
          </CommandItem>
        )}
      </CommandGroup>
    </CommandList>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const ArtistSearchCombobox = ({
  value,
  onChange,
  label,
  placeholder = 'Search artists…',
  disabled = false,
}: ArtistSearchComboboxProps): React.ReactElement => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerId = useId();

  const debounced = useDebounce(search, 300);
  const { isPending, data } = useArtistListQuery(buildArtistListParams(debounced), {
    enabled: open,
  });
  const artists: ArtistRow[] = data ?? [];

  const handleOpenChange = (next: boolean): void => {
    setOpen(next);
    if (!next) setSearch('');
  };

  const handleSelect = (name: string): void => {
    onChange(name);
    handleOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'Enter') return;
    const trimmed = search.trim();
    if (trimmed.length === 0) return;
    const matched = artists.find(
      (a) => getArtistDisplayName(a).toLowerCase() === trimmed.toLowerCase()
    );
    handleSelect(matched ? getArtistDisplayName(matched) : trimmed);
  };

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={triggerId} className="text-sm font-medium">
          {label}
        </label>
      )}
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
            <TriggerLabel value={value} placeholder={placeholder} />
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
              placeholder="Search artists…"
              value={search}
              onValueChange={setSearch}
              onKeyDown={handleKeyDown}
            />
            <ResultsList
              isPending={isPending}
              artists={artists}
              search={search}
              onSelect={handleSelect}
            />
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};
