/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Image from 'next/image';

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import type { Artist } from '@/lib/types/media-models';

export function CarouselNumberUp({
  artists,
  numberUp = 4,
}: {
  artists: Artist[];
  numberUp: number;
}) {
  // Note: you may need to experiment with gap, padding, and other styles to make sure it looks good
  // with different numbers of items per view.
  const numberUpSliced = artists.slice(0, numberUp);

  return (
    <Carousel aria-label="Featured Artists" orientation="horizontal">
      <CarouselContent className="flex justify-center gap-2">
        {numberUpSliced.map((artist) => (
          <CarouselItem key={artist.id}>
            <Image
              className="border-radius-[0.5rem]"
              src={
                artist.releases.sort(
                  (a, b) =>
                    (b.release.releasedOn?.getTime() ?? 0) - (a.release.releasedOn?.getTime() ?? 0)
                )[0].release.coverArt
              }
              alt={artist.displayName ?? `${artist.firstName} ${artist.surname}`}
              width={84}
              height={84}
            />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  );
}
