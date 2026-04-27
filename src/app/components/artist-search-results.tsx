/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback } from 'react';

import Image from 'next/image';
import { useRouter } from 'next/navigation';

import { Disc3, User } from 'lucide-react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/app/components/ui/command';
import { useArtistNavSearchQuery } from '@/app/hooks/use-artist-nav-search-query';

interface ArtistSearchResult {
  artistSlug: string;
  artistName: string;
  thumbnailSrc: string | null;
  releases: Array<{ id: string; title: string }>;
}

interface ArtistSearchResultsProps {
  id: string;
  isLoading: boolean;
  results: ArtistSearchResult[];
  onArtistSelect: (slug: string) => void;
  onReleaseSelect: (slug: string, releaseId: string) => void;
}

export const ArtistSearchResults = ({
  id,
  isLoading,
  results,
  onArtistSelect,
  onReleaseSelect,
}: ArtistSearchResultsProps) => {
  const hasResults = results.length > 0;

  return (
    <Command shouldFilter={false}>
      <CommandList id={id}>
        {isLoading ? (
          <div className="text-zinc-950-foreground py-6 text-center text-sm">Searching...</div>
        ) : !hasResults ? (
          <CommandEmpty>No artists or releases found.</CommandEmpty>
        ) : (
          results.map((artist) => (
            <CommandGroup key={artist.artistSlug} heading={artist.artistName}>
              <CommandItem
                value={`artist-${artist.artistSlug}`}
                onSelect={() => onArtistSelect(artist.artistSlug)}
                className="flex items-center gap-3 px-2 py-1.5"
              >
                {artist.thumbnailSrc ? (
                  <Image
                    src={artist.thumbnailSrc}
                    alt={artist.artistName}
                    width={32}
                    height={32}
                    className="size-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="bg-muted flex size-8 items-center justify-center rounded-full">
                    <User className="text-zinc-950-foreground size-4" />
                  </div>
                )}
                <span className="text-sm font-medium">All releases by {artist.artistName}</span>
              </CommandItem>
              {artist.releases.map((release) => (
                <CommandItem
                  key={release.id}
                  value={`release-${release.id}`}
                  onSelect={() => onReleaseSelect(artist.artistSlug, release.id)}
                  className="flex items-center gap-3 px-2 py-1.5 pl-6"
                >
                  <Disc3 className="text-zinc-950-foreground size-4" />
                  <span className="text-sm">{release.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))
        )}
      </CommandList>
    </Command>
  );
};

interface ArtistSearchResultsPanelProps {
  query: string;
}

/**
 * Container component for the `/artists/search` page. Reads pre-fetched data
 * from the TanStack Query cache (populated server-side via HydrationBoundary)
 * and renders search results with page-level navigation.
 */
export const ArtistSearchResultsPanel = ({ query }: ArtistSearchResultsPanelProps) => {
  const router = useRouter();
  const { isPending: isLoading, data } = useArtistNavSearchQuery(query);
  const results = data?.results ?? [];

  const handleArtistSelect = useCallback(
    (slug: string) => {
      router.push(`/artists/${slug}`);
    },
    [router]
  );

  const handleReleaseSelect = useCallback(
    (slug: string, releaseId: string) => {
      router.push(`/artists/${slug}?release=${releaseId}`);
    },
    [router]
  );

  if (!query) {
    return null;
  }

  return (
    <ArtistSearchResults
      id="artist-search-results-panel"
      isLoading={isLoading}
      results={results}
      onArtistSelect={handleArtistSelect}
      onReleaseSelect={handleReleaseSelect}
    />
  );
};
