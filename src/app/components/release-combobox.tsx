/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';

import Image from 'next/image';

import { Check, ChevronsUpDown, Disc3 } from 'lucide-react';

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

export interface ReleaseComboboxOption {
  id: string;
  title: string;
  coverArtSrc: string | null;
}

interface ReleaseComboboxProps {
  releases: ReleaseComboboxOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  ariaLabel?: string;
}

const ReleaseThumb = ({ src, title }: { src: string | null; title: string }) =>
  src ? (
    <Image
      src={src}
      alt=""
      width={28}
      height={28}
      className="size-7 shrink-0 rounded-sm object-cover"
    />
  ) : (
    <span className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-sm text-xs">
      {title.charAt(0).toUpperCase() || <Disc3 className="size-4" aria-hidden />}
    </span>
  );

/**
 * Controlled combobox for choosing which of an artist's releases to load into
 * the media player. Replaces the old thumbnail carousel: mobile-first
 * full-width trigger, searchable list, immediate selection. The parent loads
 * and streams the chosen release.
 *
 * @param releases - Selectable releases (id, title, optional cover art).
 * @param selectedId - The currently selected release id.
 * @param onSelect - Called with the chosen release id.
 * @param ariaLabel - Accessible label for the trigger.
 */
export const ReleaseCombobox = ({
  releases,
  selectedId,
  onSelect,
  ariaLabel = 'Select a release',
}: ReleaseComboboxProps) => {
  const [open, setOpen] = useState(false);
  const selected = releases.find((release) => release.id === selectedId) ?? releases[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className="h-auto w-full justify-between gap-2 py-2"
        >
          <span className="flex min-w-0 items-center gap-2">
            <ReleaseThumb src={selected?.coverArtSrc ?? null} title={selected?.title ?? ''} />
            <span className="truncate">{selected?.title ?? 'Select a release'}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Search releases…" className="h-9" />
          <CommandList>
            <CommandEmpty>No releases found.</CommandEmpty>
            <CommandGroup>
              {releases.map((release) => (
                <CommandItem
                  key={release.id}
                  value={`${release.title} ${release.id}`}
                  onSelect={() => {
                    onSelect(release.id);
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  <ReleaseThumb src={release.coverArtSrc} title={release.title} />
                  <span className="truncate">{release.title}</span>
                  <Check
                    className={cn(
                      'ml-auto size-4',
                      release.id === selectedId ? 'opacity-100' : 'opacity-0'
                    )}
                    aria-hidden
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
