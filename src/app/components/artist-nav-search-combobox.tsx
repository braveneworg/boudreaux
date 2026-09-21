/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState, type ReactElement } from 'react';

import nextDynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { SearchComboboxTrigger } from '@/app/components/search-combobox-trigger';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { useArtistNavSearchQuery } from '@/hooks/queries/use-artist-nav-search-query';
import { useDebounce } from '@/hooks/use-debounce';

const DEBOUNCE_DELAY = 400;
const SEARCH_PLACEHOLDER = 'Search artists & releases';

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

/**
 * The home page search: the shared zine search trigger opens a popover whose
 * field searches published artists by name, group, or release title (debounced,
 * from three characters). Picking an artist goes to their page; picking one of
 * their releases goes to that release on their page. Either way the popover
 * closes and the query clears, so the trigger rests on its placeholder.
 */
export const ArtistNavSearchCombobox = (): ReactElement => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, DEBOUNCE_DELAY);
  const { isPending, error, data } = useArtistNavSearchQuery(debouncedQuery);

  const isDebouncing = debouncedQuery !== query;
  const hasQuery = query.trim().length > 0;

  const goTo = (href: string): void => {
    setOpen(false);
    setQuery('');
    router.push(href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SearchComboboxTrigger
          aria-expanded={open}
          aria-label="Search artists and releases"
          label={hasQuery ? query : SEARCH_PLACEHOLDER}
          className="mx-4 mt-2.5 h-10 w-[calc(100%-2rem)]"
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
          onReleaseSelect={(artistSlug, releaseId) =>
            goTo(`/artists/${artistSlug}?release=${releaseId}`)
          }
        />
      </PopoverContent>
    </Popover>
  );
};
