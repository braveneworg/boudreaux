/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * ArtistReleasesCarousel — displays a horizontal carousel of other releases
 * by the same artist. Each item shows cover art and links to the release
 * player page. Conditionally rendered: returns null when there are no releases.
 */
import Image from 'next/image';
import Link from 'next/link';

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/app/components/ui/carousel';
import type { ReleaseCarouselItem } from '@/lib/types/media-models';
import { getReleaseCoverArt } from '@/lib/utils/release-helpers';

interface ArtistReleasesCarouselProps {
  /** Other releases by the same artist */
  releases: ReleaseCarouselItem[];
  /** Display name of the artist (used for aria-label) */
  artistName: string;
}

/**
 * Horizontal carousel showing other releases by the primary artist.
 * Returns null when there are no releases to display.
 */
export const ArtistReleasesCarousel = ({ releases, artistName }: ArtistReleasesCarouselProps) => {
  if (releases.length === 0) {
    return null;
  }

  return (
    <Carousel aria-label={`Other releases by ${artistName}`}>
      <CarouselContent>
        {releases.map((release) => {
          const coverArt = getReleaseCoverArt(release);

          return (
            <CarouselItem key={release.id}>
              <Link href={`/releases/${release.id}`}>
                {coverArt ? (
                  <Image
                    src={coverArt.src}
                    alt={coverArt.alt}
                    width={120}
                    height={120}
                    className="rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-[120px] w-[120px] items-center justify-center rounded-md bg-zinc-200 text-xs text-zinc-500">
                    {release.title}
                  </div>
                )}
              </Link>
            </CarouselItem>
          );
        })}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  );
};
