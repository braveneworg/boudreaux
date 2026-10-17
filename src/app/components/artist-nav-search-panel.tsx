/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Fragment, useEffect, useRef, type ReactElement } from 'react';

import Image from 'next/image';

import { Disc3, Film, User } from 'lucide-react';

import { SEARCH_RESULT_ITEM_CLASS, SearchResultRow } from '@/app/components/search-result-row';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/app/components/ui/command';
import type {
  ArtistNavSearchRelease,
  ArtistNavSearchResult,
  ArtistNavSearchVideo,
} from '@/hooks/queries/use-artist-nav-search-query';
import { resolveCdnImageSource } from '@/lib/utils/build-cdn-image-variant-url';

/** The search route answers nothing below this length, so neither does the panel. */
export const ARTIST_NAV_SEARCH_MIN_LENGTH = 3;

export const ARTIST_NAV_SEARCH_PLACEHOLDER = 'Search artists, releases & videos';

export interface ArtistNavSearchPanelProps {
  /** The live (undebounced) query. */
  query: string;
  onQueryChange: (value: string) => void;
  /** True while the query is debouncing or its request is in flight. */
  isSearching: boolean;
  isError: boolean;
  results: ArtistNavSearchResult[];
  onArtistSelect: (artistSlug: string) => void;
  /** A release row, with the artist whose group it sat in. */
  onReleaseSelect: (artist: ArtistNavSearchResult, release: ArtistNavSearchRelease) => void;
  /** A video row, with the artist whose group it sat in. */
  onVideoSelect: (artist: ArtistNavSearchResult, video: ArtistNavSearchVideo) => void;
}

/** `N releases · M videos`, each part only when there is one; `null` for none. */
const countLabel = ({ releases, videos }: ArtistNavSearchResult): string | null => {
  const parts = [
    releases.length > 0 && `${releases.length} ${releases.length === 1 ? 'release' : 'releases'}`,
    videos.length > 0 && `${videos.length} ${videos.length === 1 ? 'video' : 'videos'}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
};

/**
 * A "Releases" or "Videos" group under an artist: its heading in small
 * semibold zinc Jost, indented with its rows.
 */
const SUB_GROUP_CLASS =
  '**:[[cmdk-group-heading]]:pl-6 **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:text-zinc-600';

/** A release or video row, indented under its artist. */
const SUB_ROW_CLASS = 'flex items-center gap-3 py-1.5 pr-2 pl-6';

/** A video row's 16:9 poster, or a film tile when it has none. */
const VideoPoster = ({ posterSrc }: { posterSrc: string | null }): ReactElement =>
  posterSrc ? (
    <Image
      {...resolveCdnImageSource(posterSrc)}
      alt=""
      width={56}
      height={32}
      className="h-8 w-14 shrink-0 object-cover"
    />
  ) : (
    <span className="flex h-8 w-14 shrink-0 items-center justify-center bg-zinc-200 text-zinc-500">
      <Film aria-hidden className="size-4" />
    </span>
  );

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
  return results.length === 0 ? 'No artists, releases or videos found.' : null;
};

/**
 * Body of the home page search popover: the search field over either a status
 * line (the three-character hint, searching, failed, nothing found) or the
 * matches — one row per artist in the shared search-row anatomy, then, under
 * a "Releases" heading, slimmer indented rows for that artist's releases, each
 * led by its cover art (a disc tile when the release has none), and under a
 * "Videos" heading the same for its videos, led by the poster (a film tile
 * when there is none). A heading shows only over rows. Lazy-loaded
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
  onVideoSelect,
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
        aria-label="Search artists, releases and videos"
      />
      <CommandList>
        {message ? (
          <p role="status" className="py-6 text-center text-sm text-zinc-950">
            {message}
          </p>
        ) : (
          results.map((artist) => (
            <Fragment key={artist.artistSlug}>
              <CommandGroup>
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
                    secondary={countLabel(artist)}
                  />
                </CommandItem>
              </CommandGroup>
              {artist.releases.length > 0 ? (
                <CommandGroup
                  heading="Releases"
                  value={`releases-${artist.artistSlug}`}
                  className={SUB_GROUP_CLASS}
                >
                  {artist.releases.map((release) => (
                    <CommandItem
                      key={release.id}
                      value={`release-${release.id}`}
                      onSelect={() => onReleaseSelect(artist, release)}
                      className={SUB_ROW_CLASS}
                    >
                      {release.coverArtSrc ? (
                        <Image
                          src={release.coverArtSrc}
                          alt=""
                          width={32}
                          height={32}
                          className="size-8 shrink-0 object-cover"
                        />
                      ) : (
                        <span className="flex size-8 shrink-0 items-center justify-center bg-zinc-200 text-zinc-500">
                          <Disc3 aria-hidden className="size-4" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm">{release.title}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {artist.videos.length > 0 ? (
                <CommandGroup
                  heading="Videos"
                  value={`videos-${artist.artistSlug}`}
                  className={SUB_GROUP_CLASS}
                >
                  {artist.videos.map((video) => (
                    <CommandItem
                      key={video.id}
                      value={`video-${video.id}`}
                      onSelect={() => onVideoSelect(artist, video)}
                      className={SUB_ROW_CLASS}
                    >
                      <VideoPoster posterSrc={video.posterSrc} />
                      <span className="min-w-0 flex-1 truncate text-sm">{video.title}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </Fragment>
          ))
        )}
      </CommandList>
    </Command>
  );
};
