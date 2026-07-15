/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import React, { useId, useState } from 'react';

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
import { useDebounce } from '@/app/hooks/use-debounce';
import { useProducersSearchQuery } from '@/app/hooks/use-producers-search-query';

// --------------------------------------------------------------------------
// Public types
// --------------------------------------------------------------------------

export interface ProducerPill {
  id?: string; // absent = new producer, created on save
  name: string;
}

export interface ProducerMultiComboboxProps {
  value: ProducerPill[];
  onChange: (next: ProducerPill[]) => void;
  label?: string;
  disabled?: boolean;
}

// --------------------------------------------------------------------------
// Sub-components (extracted to keep main component under ESLint complexity:10)
// --------------------------------------------------------------------------

interface TriggerLabelProps {
  count: number;
}

const TriggerLabel = ({ count }: TriggerLabelProps): React.ReactElement => (
  <>
    {count > 0 ? `${count} producer${count === 1 ? '' : 's'} selected` : 'Search producers…'}
    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
  </>
);

interface ResultsListProps {
  isPending: boolean;
  results: ProducerPill[];
  search: string;
  onSelect: (pill: ProducerPill) => void;
}

const ResultsList = ({
  isPending,
  results,
  search,
  onSelect,
}: ResultsListProps): React.ReactElement => {
  const trimmed = search.trim();
  const hasExactMatch = results.some((r) => r.name.toLowerCase() === trimmed.toLowerCase());
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
      <CommandEmpty>No producers found.</CommandEmpty>
      <CommandGroup>
        {results.map((producer) => (
          <CommandItem
            key={producer.id ?? producer.name}
            value={producer.name}
            onSelect={() => onSelect({ id: producer.id, name: producer.name })}
          >
            {producer.name}
          </CommandItem>
        ))}
        {showAddNew && (
          <CommandItem value={`__add__${trimmed}`} onSelect={() => onSelect({ name: trimmed })}>
            {`Add "${trimmed}"`}
          </CommandItem>
        )}
      </CommandGroup>
    </CommandList>
  );
};

interface PillsListProps {
  pills: ProducerPill[];
  disabled: boolean;
  onRemove: (name: string) => void;
}

const PillsList = ({ pills, disabled, onRemove }: PillsListProps): React.ReactElement => (
  <div className="flex flex-wrap gap-2" role="list" aria-label="Selected producers">
    {pills.map((pill) => (
      <span key={pill.id ?? pill.name} role="listitem" className="flex items-center gap-1">
        <Badge variant="secondary" className="gap-1">
          {pill.name}
          <button
            type="button"
            className="hover:bg-muted-foreground/20 ml-1"
            disabled={disabled}
            aria-label={`Remove ${pill.name}`}
            onClick={() => onRemove(pill.name)}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
        {pill.id === undefined && (
          <Badge variant="outline" className="text-xs">
            new
          </Badge>
        )}
      </span>
    ))}
  </div>
);

// --------------------------------------------------------------------------
// Main component
// --------------------------------------------------------------------------

export const ProducerMultiCombobox = ({
  value,
  onChange,
  label,
  disabled = false,
}: ProducerMultiComboboxProps): React.ReactElement => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerId = useId();

  const debounced = useDebounce(search, 300);
  const { isPending, data } = useProducersSearchQuery(debounced, { enabled: open });
  const results: ProducerPill[] = data ?? [];

  const currentNames = new Set(value.map((p) => p.name.toLowerCase()));

  const addPill = (pill: ProducerPill): void => {
    if (currentNames.has(pill.name.toLowerCase())) return;
    onChange([...value, pill]);
  };

  const removePill = (name: string): void => {
    onChange(value.filter((p) => p.name !== name));
  };

  const handleOpenChange = (next: boolean): void => {
    setOpen(next);
    if (!next) setSearch('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'Enter') return;
    const trimmed = search.trim();
    if (trimmed.length === 0) return;
    const matched = results.find((r) => r.name.toLowerCase() === trimmed.toLowerCase());
    addPill(matched ?? { name: trimmed });
  };

  return (
    <div className="space-y-2">
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
              placeholder="Search producers…"
              value={search}
              onValueChange={setSearch}
              onKeyDown={handleKeyDown}
            />
            <ResultsList
              isPending={isPending}
              results={results}
              search={search}
              onSelect={addPill}
            />
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && <PillsList pills={value} disabled={disabled} onRemove={removePill} />}
    </div>
  );
};
