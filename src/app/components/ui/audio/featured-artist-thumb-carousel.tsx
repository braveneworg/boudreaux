import Image from 'next/image';

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

export function FeaturedArtistsThumbCarousel({ artists }: { artists: Artist[] }) {
  return (
    <Carousel aria-label="Featured Artists" orientation="horizontal">
      <CarouselContent>
        {artists.map((artist) => (
          <CarouselItem key={artist.id}>
            <Image
              className="border-[1px] border-zinc-300"
              src={
                artist.releases.sort(
                  (a: { releasedOn: number }, b: { releasedOn: number }) =>
                    b.releasedOn - a.releasedOn
                )[0].coverArt
              }
              alt={artist.name}
              width={96}
              height={96}
            />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  );
}
