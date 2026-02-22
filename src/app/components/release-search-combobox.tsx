/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * ReleaseSearchCombobox — a client-side combobox dropdown for searching
 * published releases by artist name, release title, or group name.
 * Uses shadcn/ui Popover + Command (cmdk) for keyboard-navigable search.
 * Selecting a result navigates to the release's media player page.
 */
'use client';

import * as React from 'react';

import Image from 'next/image';
import { useRouter } from 'next/navigation';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/app/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import type { PublishedReleaseListing } from '@/lib/types/media-models';
import {
  buildReleaseSearchValue,
  getArtistDisplayNameForRelease,
  getReleaseCoverArt,
} from '@/lib/utils/release-helpers';

interface ReleaseSearchComboboxProps {
  /** Array of published releases to make searchable */
  releases: PublishedReleaseListing[];
}

/**
 * A combobox dropdown that lets users search releases by typing.
 * Each result shows a cover art thumbnail, artist name, and title.
 * Selecting a result navigates to `/releases/{releaseId}`.
 */
export const ReleaseSearchCombobox = ({ releases }: ReleaseSearchComboboxProps) => {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const handleSelect = React.useCallback(
    (releaseId: string) => {
      setOpen(false);
      router.push(`/releases/${releaseId}`);
    },
    [router]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-expanded={open}
          aria-label="Search releases"
          className="flex w-full items-center justify-between rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-500 hover:border-zinc-400 transition-colors"
        >
          Search releases...
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search by artist, title, or group..."
            aria-label="Search releases"
          />
          <CommandList>
            <CommandEmpty>No releases found.</CommandEmpty>
            <CommandGroup>
              {releases.map((release) => {
                const coverArt = getReleaseCoverArt(release);
                const artistName = release.artistReleases[0]
                  ? getArtistDisplayNameForRelease(release.artistReleases[0].artist)
                  : 'Unknown Artist';
                const searchValue = buildReleaseSearchValue(release);

                return (
                  <CommandItem
                    key={release.id}
                    value={searchValue}
                    onSelect={() => handleSelect(release.id)}
                    className="flex items-center gap-3 px-2 py-1.5"
                  >
                    {coverArt ? (
                      <Image
                        src={coverArt.src}
                        alt={coverArt.alt}
                        width={40}
                        height={40}
                        className="rounded-sm object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-zinc-200 text-zinc-500 text-xs">
                        ♫
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{release.title}</span>
                      <span className="text-xs text-zinc-500">{artistName}</span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
