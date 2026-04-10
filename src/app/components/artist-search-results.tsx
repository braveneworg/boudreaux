/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import Image from 'next/image';
import Link from 'next/link';

import { Loader2 } from 'lucide-react';

import { useArtistSearchQuery } from '@/app/hooks/use-artist-search-query';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';

interface ArtistSearchResultsProps {
  query: string;
}

/**
 * Client content wrapper for artist search results.
 * Uses TanStack Query to fetch search results (hydrated from SSR prefetch).
 */
export const ArtistSearchResults = ({ query }: ArtistSearchResultsProps) => {
  const { isPending, error, data } = useArtistSearchQuery(query);

  if (isPending && query) {
    return (
      <div className="flex min-h-60 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-12 text-center">
        <p className="text-muted-foreground">Unable to search artists. Please try again later.</p>
        <Link
          href="/artists/search"
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </Link>
      </div>
    );
  }

  const artists = data?.artists ?? [];

  if (artists.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
        <p className="text-muted-foreground">
          {query ? `No artists found for "${query}".` : 'Enter at least 3 characters to search.'}
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2 px-4 py-4">
      {artists.map((artist: Record<string, unknown>) => {
        const displayName = getArtistDisplayName(
          artist as unknown as Parameters<typeof getArtistDisplayName>[0]
        );
        const images = artist.images as Array<{ src?: string; altText?: string }> | undefined;
        const thumbnail = images?.[0];

        return (
          <li key={artist.id as string}>
            <Link
              href={`/artists/${artist.slug as string}`}
              className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent"
            >
              {thumbnail ? (
                <Image
                  src={thumbnail.src || ''}
                  alt={thumbnail.altText || displayName}
                  width={56}
                  height={56}
                  className="size-14 rounded-md object-cover"
                />
              ) : (
                <div className="flex size-14 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-sm font-medium">{displayName}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
};
