/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import nextDynamic from 'next/dynamic';

import type { FeaturedArtist } from '@/lib/types/media-models';

const FeaturedArtistsPlayerDynamic = nextDynamic(
  () =>
    import('./featured-artists-player').then((mod) => ({
      default: mod.FeaturedArtistsPlayer,
    })),
  { ssr: false }
);

interface FeaturedArtistsPlayerClientProps {
  featuredArtists: FeaturedArtist[];
}

export const FeaturedArtistsPlayerClient = ({
  featuredArtists,
}: FeaturedArtistsPlayerClientProps) => {
  return <FeaturedArtistsPlayerDynamic featuredArtists={featuredArtists} />;
};
