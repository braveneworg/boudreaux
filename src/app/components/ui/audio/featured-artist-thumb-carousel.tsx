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
      <CarouselContent className="flex justify-center gap-2">
        {artists.map((artist) => (
          <CarouselItem key={artist.id}>
            <Image
              className="border-radius-[0.5rem]"
              src={artist.releases.sort((a, b) => b.releasedOn - a.releasedOn)[0].coverArt}
              alt={artist.name}
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
