/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';

import { Check, ChevronsUpDown } from 'lucide-react';

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
import { cn } from '@/lib/utils';
import { formatUTCOffset } from '@/lib/utils/timezone';

/** IANA timezone regions, in display priority order. */
const REGION_ORDER = [
  'America',
  'Europe',
  'Asia',
  'Pacific',
  'Australia',
  'Africa',
  'Atlantic',
  'Indian',
  'Arctic',
  'Antarctica',
  'Etc',
];

/** Timezones shown in the "Popular" group before the regional list. */
const POPULAR_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
];

function getSupportedTimezones(): string[] {
  try {
    // Intl.supportedValuesOf is available in all modern environments and
    // returns the runtime's full, up-to-date IANA timezone database.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (Intl as any).supportedValuesOf('timeZone') as string[];
  } catch {
    return POPULAR_TIMEZONES;
  }
}

function getRegion(tz: string): string {
  const slash = tz.indexOf('/');
  return slash === -1 ? 'Other' : tz.slice(0, slash);
}

/**
 * Produce a human-readable label for the timezone selector entry.
 * e.g. "America/New_York" → "New York (UTC-05:00)"
 */
function formatTZLabel(tz: string): string {
  const localPart = tz.includes('/') ? tz.split('/').slice(1).join(' / ').replace(/_/g, ' ') : tz;
  return `${localPart} (${formatUTCOffset(tz)})`;
}

export interface TimezoneSelectProps {
  value?: string | null;
  onChange: (tz: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export function TimezoneSelect({
  value,
  onChange,
  disabled,
  className,
  placeholder = 'Select timezone...',
}: TimezoneSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Derive timezone list once on mount (stable reference via useState initialiser).
  const [allTimezones] = useState<string[]>(() => getSupportedTimezones());

  const popular = POPULAR_TIMEZONES.filter((tz) => allTimezones.includes(tz));
  const nonPopular = allTimezones.filter((tz) => !POPULAR_TIMEZONES.includes(tz));

  // Group non-popular timezones by IANA region prefix.
  const grouped = nonPopular.reduce<Record<string, string[]>>((acc, tz) => {
    const region = getRegion(tz);
    if (!acc[region]) acc[region] = [];
    acc[region].push(tz);
    return acc;
  }, {});

  const orderedRegions = [
    ...REGION_ORDER.filter((r) => r in grouped),
    ...Object.keys(grouped)
      .filter((r) => !REGION_ORDER.includes(r))
      .sort(),
  ];

  const filterTZ = (tz: string) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return tz.toLowerCase().includes(q) || formatTZLabel(tz).toLowerCase().includes(q);
  };

  const filteredPopular = popular.filter(filterTZ);
  const filteredGrouped = orderedRegions.reduce<Record<string, string[]>>((acc, region) => {
    const matches = (grouped[region] ?? []).filter(filterTZ);
    if (matches.length > 0) acc[region] = matches;
    return acc;
  }, {});

  const selectedLabel = value ? formatTZLabel(value) : null;

  const handleSelect = (tz: string) => {
    onChange(tz);
    setSearch('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !value && 'text-zinc-950-foreground',
            className
          )}
        >
          <span className="truncate">{selectedLabel ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[calc(100vw-2rem)] p-0 sm:w-[420px]"
        align="start"
        avoidCollisions
        collisionPadding={8}
        sideOffset={4}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search timezones..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList
            style={{ maxHeight: 'var(--radix-popover-content-available-height, 300px)' }}
          >
            <CommandEmpty>No timezone found.</CommandEmpty>

            {filteredPopular.length > 0 && (
              <CommandGroup heading="Popular">
                {filteredPopular.map((tz) => (
                  <CommandItem key={tz} value={tz} onSelect={() => handleSelect(tz)}>
                    <Check
                      className={cn('mr-2 h-4 w-4', value === tz ? 'opacity-100' : 'opacity-0')}
                    />
                    {formatTZLabel(tz)}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {orderedRegions
              .filter((r) => (filteredGrouped[r]?.length ?? 0) > 0)
              .map((region) => (
                <CommandGroup key={region} heading={region}>
                  {filteredGrouped[region].map((tz) => (
                    <CommandItem key={tz} value={tz} onSelect={() => handleSelect(tz)}>
                      <Check
                        className={cn('mr-2 h-4 w-4', value === tz ? 'opacity-100' : 'opacity-0')}
                      />
                      {formatTZLabel(tz)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
