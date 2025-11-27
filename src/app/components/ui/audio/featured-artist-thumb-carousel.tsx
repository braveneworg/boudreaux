import Image from 'next/image';

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

export function FeaturedArtistsThumbCarousel({
  artists,
  onSelect,
}: {
  artists: Artist[];
  onSelect: (artist: Artist) => void;
}) {
  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    // Handle click event
    console.log(`Clicked on artist: ${event.currentTarget}`);
    const artist = artists.find((a) => a.id === event.currentTarget.dataset.id);
    if (artist) {
      onSelect(artist);
    }
  };

  return (
    <Carousel
      aria-label="Featured Artists"
      orientation="horizontal"
      opts={{
        align: 'center',
        slidesToScroll: 3,
        loop: true,
      }}
    >
      <CarouselContent className="gap-6">
        {artists.map((artist) => (
          <CarouselItem key={artist.id} onClick={handleClick}>
            <Image
              data-id={artist.id}
              className="relative aspect-square w-24 rounded-lg border border-solid border-zinc-300 shadow-lg"
              src={
                artist.releases.sort(
                  (a, b) => new Date(b.releasedOn).getTime() - new Date(a.releasedOn).getTime()
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
