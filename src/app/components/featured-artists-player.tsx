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
    <MediaPlayer>
      <div className="space-y-6">
        {/* Featured Artists Carousel */}
        <MediaPlayer.FeaturedArtistCarousel
          featuredArtists={featuredArtists}
          onSelect={handleSelectArtist}
        />

        {/* Selected Artist Details */}
        {selectedArtist && (
          <div className="flex flex-col items-center space-y-4">
            {/* Cover Art */}
            {getCoverArt(selectedArtist) && (
              <div className="relative w-full max-w-sm aspect-square">
                <Image
                  src={getCoverArt(selectedArtist)!}
                  alt={getDisplayName(selectedArtist)}
                  fill
                  className="object-cover rounded-lg shadow-lg"
                  sizes="(max-width: 640px) 100vw, 384px"
                />
              </div>
            )}

            {/* Artist Name and Description */}
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold text-zinc-900">
                {getDisplayName(selectedArtist)}
              </h2>
              {selectedArtist.description && (
                <p className="text-sm text-zinc-600 max-w-md">{selectedArtist.description}</p>
              )}
              {selectedArtist.release && (
                <p className="text-sm text-zinc-500">
                  Latest Release: {selectedArtist.release.title}
                </p>
              )}
            </div>

            {/* Audio Controls - only show if there's a track with audio */}
            {selectedArtist.track?.audioUrl && (
              <div className="w-full max-w-md">
                <MediaPlayer.Controls audioSrc={selectedArtist.track.audioUrl} />
              </div>
            )}
          </div>
        )}
      </div>
    </MediaPlayer>
  );
};
