/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef, useState, type ReactElement } from 'react';

import nextDynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { SearchComboboxTrigger } from '@/app/components/search-combobox-trigger';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import {
  useArtistNavSearchQuery,
  type ArtistNavSearchResult,
} from '@/hooks/queries/use-artist-nav-search-query';
import { useDebounce } from '@/hooks/use-debounce';

// Static, not lazy: it owns the primed handoffs, and a pick must prime inside
// its own gesture, before any chunk could load.
import {
  HomeSearchPlayDialog,
  type HomeSearchPickArtist,
  type HomeSearchPlayDialogHandle,
} from './home-search-play-dialog';

/** Idle time after the last keystroke before the search query fires. */
export const ARTIST_NAV_SEARCH_DEBOUNCE_MS = 400;
const SEARCH_PLACEHOLDER = 'Search artists, releases & videos';

/** Reserves the panel's resting footprint so the popover doesn't jump when the chunk lands. */
const PanelFallback = (): ReactElement => <div aria-hidden className="h-[6.75rem] bg-zinc-50" />;

// cmdk and the result rows stay out of the home page's initial bundle — they
// load on first open. `ssr: false` + `loading` give the lazy panel its own
// Suspense boundary, so opening the popover never suspends the whole route
// (docs/lessons/react-nextjs/next-dynamic-needs-own-boundary.md).
const ArtistNavSearchPanel = nextDynamic(
  () => import('./artist-nav-search-panel').then((mod) => ({ default: mod.ArtistNavSearchPanel })),
  { ssr: false, loading: PanelFallback }
);

/** The artist whose search group a picked row sat in. */
const pickArtist = ({ artistName, artistSlug }: ArtistNavSearchResult): HomeSearchPickArtist => ({
  artistName,
  artistSlug,
});

/**
 * The home page search: the shared zine search trigger opens a popover whose
 * field searches public artists by name, release title or video title
 * (debounced, from three characters). Picking an artist goes to their page;
 * picking one of their releases or videos plays it in place, in the home
 * search's play modal, bylined by that artist. Either way the popover closes
 * and the query clears, so the trigger rests on its placeholder, and closing
 * the modal puts focus back on the trigger.
 */
export const ArtistNavSearchCombobox = (): ReactElement => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, ARTIST_NAV_SEARCH_DEBOUNCE_MS);
  const { isPending, error, data } = useArtistNavSearchQuery(debouncedQuery);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const playDialogRef = useRef<HomeSearchPlayDialogHandle>(null);

  const isDebouncing = debouncedQuery !== query;
  const hasQuery = query.trim().length > 0;

  const closeSearch = (): void => {
    setOpen(false);
    setQuery('');
  };

  const goTo = (href: string): void => {
    closeSearch();
    router.push(href);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <SearchComboboxTrigger
            ref={triggerRef}
            aria-expanded={open}
            aria-label="Search artists, releases and videos"
            label={hasQuery ? query : SEARCH_PLACEHOLDER}
            className="mt-2.5 h-10"
          />
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <ArtistNavSearchPanel
            query={query}
            onQueryChange={setQuery}
            isSearching={isDebouncing || isPending}
            isError={!isDebouncing && error !== null}
            results={data?.results ?? []}
            onArtistSelect={(artistSlug) => goTo(`/artists/${artistSlug}`)}
            // Both prime inside this pick's gesture, so playback starts now.
            onReleaseSelect={(artist, release) => {
              closeSearch();
              playDialogRef.current?.openRelease(pickArtist(artist), release);
            }}
            onVideoSelect={(artist, video) => {
              closeSearch();
              playDialogRef.current?.openVideo(pickArtist(artist), video);
            }}
          />
        </PopoverContent>
      </Popover>
      <HomeSearchPlayDialog ref={playDialogRef} returnFocusRef={triggerRef} />
    </>
  );
};
