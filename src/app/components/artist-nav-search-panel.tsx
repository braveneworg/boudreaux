/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useRef, type ReactElement } from 'react';

import Image from 'next/image';

import { Disc3, User } from 'lucide-react';

import { SEARCH_RESULT_ITEM_CLASS, SearchResultRow } from '@/app/components/search-result-row';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/app/components/ui/command';
import type { ArtistNavSearchResult } from '@/hooks/queries/use-artist-nav-search-query';

/** The search route answers nothing below this length, so neither does the panel. */
export const ARTIST_NAV_SEARCH_MIN_LENGTH = 3;

export const ARTIST_NAV_SEARCH_PLACEHOLDER = 'Search artists & releases';

export interface ArtistNavSearchPanelProps {
  /** The live (undebounced) query. */
  query: string;
  onQueryChange: (value: string) => void;
  /** True while the query is debouncing or its request is in flight. */
  isSearching: boolean;
  isError: boolean;
  results: ArtistNavSearchResult[];
  onArtistSelect: (artistSlug: string) => void;
  onReleaseSelect: (artistSlug: string, releaseId: string) => void;
}

const releaseCountLabel = (count: number): string | null => {
  if (count === 0) return null;
  return `${count} ${count === 1 ? 'release' : 'releases'}`;
};

/** The one-line message shown in place of rows, or `null` when rows should show. */
const statusMessage = ({
  query,
  isSearching,
  isError,
  results,
}: Pick<ArtistNavSearchPanelProps, 'query' | 'isSearching' | 'isError' | 'results'>):
  string | null => {
  if (query.trim().length < ARTIST_NAV_SEARCH_MIN_LENGTH) {
    return `Type at least ${ARTIST_NAV_SEARCH_MIN_LENGTH} characters`;
  }
  if (isError) return 'Search is unavailable right now.';
  if (isSearching) return 'Searching…';
  return results.length === 0 ? 'No artists or releases found.' : null;
};

/**
 * Body of the home page search popover: the search field over either a status
 * line (the three-character hint, searching, failed, nothing found) or the
 * matches — one row per artist in the shared search-row anatomy, each followed
 * by slimmer, indented rows for that artist's matching releases. Lazy-loaded
 * into a popover that is already open, so Radix's mount-time autofocus has
 * already run against the loading fallback — the field takes focus itself.
 * Server search provides the matches; cmdk's own filtering is disabled.
 */
export const ArtistNavSearchPanel = ({
  query,
  onQueryChange,
  isSearching,
  isError,
  results,
  onArtistSelect,
  onReleaseSelect,
}: ArtistNavSearchPanelProps): ReactElement => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const message = statusMessage({ query, isSearching, isError, results });

  return (
    <Command shouldFilter={false}>
      <CommandInput
        ref={inputRef}
        value={query}
        onValueChange={onQueryChange}
        placeholder={ARTIST_NAV_SEARCH_PLACEHOLDER}
        aria-label="Search artists and releases"
      />
      <CommandList>
        {message ? (
          <p role="status" className="py-6 text-center text-sm text-zinc-950">
            {message}
          </p>
        ) : (
          results.map((artist) => (
            <CommandGroup key={artist.artistSlug}>
              <CommandItem
                value={`artist-${artist.artistSlug}`}
                onSelect={() => onArtistSelect(artist.artistSlug)}
                className={SEARCH_RESULT_ITEM_CLASS}
              >
                <SearchResultRow
                  thumbnail={
                    artist.thumbnailSrc ? (
                      <Image
                        src={artist.thumbnailSrc}
                        alt=""
                        width={40}
                        height={40}
                        className="size-10 shrink-0 object-cover"
                      />
                    ) : (
                      <span className="flex size-10 shrink-0 items-center justify-center bg-zinc-200 text-zinc-500">
                        <User aria-hidden className="size-4" />
                      </span>
                    )
                  }
                  primary={artist.artistName}
                  secondary={releaseCountLabel(artist.releases.length)}
                />
              </CommandItem>
              {artist.releases.map((release) => (
                <CommandItem
                  key={release.id}
                  value={`release-${release.id}`}
                  onSelect={() => onReleaseSelect(artist.artistSlug, release.id)}
                  className="flex items-center gap-3 py-1.5 pr-2 pl-6"
                >
                  <Disc3 aria-hidden className="size-4 shrink-0 text-zinc-950" />
                  <span className="min-w-0 flex-1 truncate text-sm">{release.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))
        )}
      </CommandList>
    </Command>
  );
};
