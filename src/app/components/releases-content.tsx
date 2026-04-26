/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import Link from 'next/link';

import { Loader2 } from 'lucide-react';

import { usePublishedReleasesQuery } from '@/app/hooks/use-published-releases-query';
import type { PublishedReleaseListing } from '@/lib/types/media-models';
import {
  getArtistDisplayNameForRelease,
  getBandcampUrl,
  getReleaseCoverArt,
} from '@/lib/utils/release-helpers';

import { ReleaseCardGrid } from './release-card-grid';
import { ReleaseSearchCombobox } from './release-search-combobox';

/**
 * Transform a release listing into the shape expected by ReleaseCardGrid.
 */
const toCardRelease = (release: PublishedReleaseListing) => {
  const artistName = release.artistReleases[0]
    ? getArtistDisplayNameForRelease(release.artistReleases[0].artist)
    : 'Unknown Artist';

  return {
    id: release.id,
    title: release.title,
    artistName: artistName ?? 'Unknown Artist',
    coverArt: getReleaseCoverArt(release),
    bandcampUrl: getBandcampUrl(release),
  };
};

/**
 * Client content wrapper for the releases listing page.
 * Uses TanStack Query to fetch published releases (hydrated from SSR prefetch).
 */
export const ReleasesContent = () => {
  const { isPending, error, data } = usePublishedReleasesQuery();

  if (isPending) {
    return (
      <div className="flex min-h-100 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-950-foreground" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-12 text-center">
        <p className="text-zinc-950-foreground">Unable to load releases. Please try again later.</p>
        <Link
          href="/releases"
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </Link>
      </div>
    );
  }

  const releases = (data?.releases ?? []) as unknown as PublishedReleaseListing[];
  const cardReleases = releases.map(toCardRelease);

  return (
    <div className="flex flex-col gap-6 px-4 py-4">
      <ReleaseSearchCombobox releases={releases} />
      <ReleaseCardGrid releases={cardReleases} />
    </div>
  );
};
