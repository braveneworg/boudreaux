'use client';

import { useState } from 'react';

import Image from 'next/image';

import { MediaPlayer } from '@/app/components/ui/audio/media-player';
import type { FeaturedArtist } from '@/lib/types/media-models';

interface FeaturedArtistsPlayerProps {
  featuredArtists: FeaturedArtist[];
}

/**
 * Client component that displays the featured artists carousel with media player controls.
 * @param featuredArtists - Array of featured artists to display
 */
export const FeaturedArtistsPlayer = ({ featuredArtists }: FeaturedArtistsPlayerProps) => {
  const [selectedArtist, setSelectedArtist] = useState<FeaturedArtist | null>(
    featuredArtists.length > 0 ? featuredArtists[0] : null
  );
  const [isPlaying, setIsPlaying] = useState(false);

  /**
   * Get the display name for a featured artist
   */
  const getDisplayName = (featured: FeaturedArtist): string => {
    if (featured.displayName) {
      return featured.displayName;
    }
    if (featured.artists && featured.artists.length > 0) {
      const artist = featured.artists[0];
      return artist.displayName ?? `${artist.firstName} ${artist.surname}`;
    }
    if (featured.group) {
      return featured.group.name;
    }
    return 'Unknown Artist';
  };

  /**
   * Get the cover art URL for a featured artist
   */
  const getCoverArt = (featured: FeaturedArtist): string | null => {
    if (featured.coverArt) {
      return featured.coverArt;
    }
    if (featured.release?.coverArt) {
      return featured.release.coverArt;
    }
    return null;
  };

  const handleSelectArtist = (artist: FeaturedArtist) => {
    setSelectedArtist(artist);
  };

  if (featuredArtists.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500">
        <p>No featured artists available at this time.</p>
      </div>
    );
  }

  return (
    <MediaPlayer className="mb-2">
      <div className="space-y-2 mt-2">
        {/* Featured Artists Carousel */}
        <MediaPlayer.FeaturedArtistCarousel
          featuredArtists={featuredArtists}
          onSelect={handleSelectArtist}
        />

        {/* Selected Artist Details */}
        {selectedArtist && (
          <div className="flex flex-col items-center">
            {/* Cover Art with Audio Controls beneath it */}
            <div className="w-full max-w-sm">
              {/* Cover Art - only show if we have a valid image */}
              {getCoverArt(selectedArtist) ? (
                <div className="relative w-full aspect-square">
                  <Image
                    src={getCoverArt(selectedArtist)!}
                    alt={getDisplayName(selectedArtist)}
                    fill
                    className="object-cover rounded-t-lg shadow-lg"
                    sizes="(max-width: 640px) 100vw, 384px"
                  />
                </div>
              ) : null}

              {/* Audio Controls - sits directly beneath the image */}
              {selectedArtist.track?.audioUrl && (
                <div className="w-full bg-zinc-900 overflow-hidden">
                  <MediaPlayer.Controls
                    audioSrc={selectedArtist.track.audioUrl}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                  />
                </div>
              )}

              {/* Info Ticker Tape - beneath the controls */}
              {selectedArtist.track?.title && (
                <MediaPlayer.InfoTickerTape featuredArtist={selectedArtist} isPlaying={isPlaying} />
              )}
            </div>
          </div>
        )}
      </div>
    </MediaPlayer>
  );
};
