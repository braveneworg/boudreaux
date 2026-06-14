/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * ReleaseSearchCombobox — a combobox dropdown for searching published releases
 * by artist name, release title, or catalog number. Search runs server-side
 * (debounced), so it covers the full catalog rather than only loaded pages.
 * Uses shadcn/ui Popover + Command (cmdk) for keyboard-navigable results.
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
import { usePublishedReleaseSearchQuery } from '@/app/hooks/use-published-releases-query';
import { useDebounce } from '@/hooks/use-debounce';
import { getArtistDisplayNameForRelease, getReleaseCoverArt } from '@/lib/utils/release-helpers';

/**
 * A combobox dropdown that lets users search releases by typing. Results are
 * fetched from the server as the user types and each shows a cover art
 * thumbnail, artist name, and title. Selecting a result navigates to
 * `/releases/{releaseId}`.
 */
export const ReleaseSearchCombobox = () => {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { data: releases, isFetching } = usePublishedReleaseSearchQuery(debouncedSearch);

  const handleSelect = React.useCallback(
    (releaseId: string) => {
      setOpen(false);
      router.push(`/releases/${releaseId}`);
    },
    [router]
  );

  const hasQuery = debouncedSearch.trim().length > 0;

  // Derive cover art + artist name once per result set rather than on every
  // keystroke-driven re-render (the search input updates state on each key,
  // while `releases` only changes when the debounced query resolves).
  const enrichedResults = React.useMemo(
    () =>
      (releases ?? []).map((release) => ({
        release,
        coverArt: getReleaseCoverArt(release),
        artistName: release.artistReleases[0]
          ? getArtistDisplayNameForRelease(release.artistReleases[0].artist)
          : null,
      })),
    [releases]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-expanded={open}
          aria-label="Search releases"
          className="flex w-full items-center justify-between rounded-md border border-zinc-950 bg-zinc-50 px-3 py-2 text-sm transition-colors hover:border-zinc-400"
        >
          Search releases...
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        {/* Server provides the matches; disable cmdk's client-side filtering. */}
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search by artist, title, or catalog number..."
            aria-label="Search releases"
          />
          <CommandList>
            <CommandEmpty>
              {hasQuery && !isFetching ? 'No releases found.' : 'Type to search releases.'}
            </CommandEmpty>
            <CommandGroup>
              {enrichedResults.map(({ release, coverArt, artistName }) => {
                return (
                  <CommandItem
                    key={release.id}
                    value={release.id}
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
                      <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-zinc-200 text-xs text-zinc-500">
                        ♫
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{release.title}</span>
                      {artistName && <span className="text-xs text-zinc-500">{artistName}</span>}
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
