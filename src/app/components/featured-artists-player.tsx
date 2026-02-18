/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useState } from 'react';

import { MediaPlayer, type MediaPlayerControls } from '@/app/components/ui/audio/media-player';
import type { ArtistRelease, FeaturedArtist } from '@/lib/types/media-models';

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
  const [shouldAutoPlay, setShouldAutoPlay] = useState(false);
  const [playerControls, setPlayerControls] = useState<MediaPlayerControls | null>(null);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  /**
   * Handle toggle play/pause from cover art click
   */
  const handleTogglePlay = useCallback(() => {
    playerControls?.toggle();
  }, [playerControls]);

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
    // Fallback to first image in the release
    if (featured.release?.images?.length && featured.release.images[0].src) {
      return featured.release.images[0].src;
    }
    // Fallback to first artist's first image
    if (featured.artists?.length > 0) {
      for (const artist of featured.artists) {
        if (artist.images?.length > 0) {
          return artist.images[0].src;
        }
      }
    }
    return null;
  };

  const handleSelectArtist = (artist: FeaturedArtist) => {
    // If clicking the already-selected artist, toggle play/pause
    if (selectedArtist?.id === artist.id) {
      if (isPlaying) {
        playerControls?.pause();
      } else {
        playerControls?.play();
      }
      return;
    }

    // setIsPlaying(false); // Reset playing state when selecting a new artist
    setShouldAutoPlay(true); // Auto-play when selecting a new artist from carousel
    setSelectedArtist(artist);
  };

  /**
   * Handle track selection from the track list drawer
   * Updates the selected artist's track to the newly selected track
   */
  const handleTrackSelect = useCallback(
    (trackId: string) => {
      if (!selectedArtist?.release?.releaseTracks) return;

      // Find the track in the release
      const releaseTrack = selectedArtist.release.releaseTracks.find(
        (rt) => rt.track.id === trackId
      );

      if (releaseTrack) {
        // Create a new selected artist with the new track
        const updatedArtist: FeaturedArtist = {
          ...selectedArtist,
          track: releaseTrack.track,
        };
        setSelectedArtist(updatedArtist);
        setShouldAutoPlay(true); // Auto-play the selected track
      }
    },
    [selectedArtist]
  );

  /**
   * Handle track ended - auto-advance to next track if available
   */
  const handleTrackEnded = useCallback(() => {
    if (!selectedArtist?.release?.releaseTracks || !selectedArtist.track) return;

    const releaseTracks = selectedArtist.release.releaseTracks;
    // Sort tracks by position
    const sortedTracks = [...releaseTracks].sort((a, b) => a.track.position - b.track.position);

    // Find the current track index
    const currentIndex = sortedTracks.findIndex((rt) => rt.track.id === selectedArtist.track?.id);

    // If there's a next track, play it
    if (currentIndex !== -1 && currentIndex < sortedTracks.length - 1) {
      const nextTrack = sortedTracks[currentIndex + 1].track;
      const updatedArtist: FeaturedArtist = {
        ...selectedArtist,
        track: nextTrack,
      };
      setSelectedArtist(updatedArtist);
      setShouldAutoPlay(true); // Auto-play next track
    }
  }, [selectedArtist]);

  /**
   * Handle previous track button - go to previous track in release if available
   */
  const handlePreviousTrack = useCallback(
    (wasPlaying: boolean) => {
      if (!selectedArtist?.release?.releaseTracks || !selectedArtist.track) return;

      const releaseTracks = selectedArtist.release.releaseTracks;
      // Sort tracks by position
      const sortedTracks = [...releaseTracks].sort((a, b) => a.track.position - b.track.position);

      // Find the current track index
      const currentIndex = sortedTracks.findIndex((rt) => rt.track.id === selectedArtist.track?.id);

      // If there's a previous track, go to it
      if (currentIndex > 0) {
        const prevTrack = sortedTracks[currentIndex - 1].track;
        const updatedArtist: FeaturedArtist = {
          ...selectedArtist,
          track: prevTrack,
        };
        setSelectedArtist(updatedArtist);
        setShouldAutoPlay(wasPlaying); // Only auto-play if was playing
      }
    },
    [selectedArtist]
  );

  /**
   * Handle next track button - go to next track in release if available
   */
  const handleNextTrack = useCallback(
    (wasPlaying: boolean) => {
      if (!selectedArtist?.release?.releaseTracks || !selectedArtist.track) return;

      const releaseTracks = selectedArtist.release.releaseTracks;
      // Sort tracks by position
      const sortedTracks = [...releaseTracks].sort((a, b) => a.track.position - b.track.position);

      // Find the current track index
      const currentIndex = sortedTracks.findIndex((rt) => rt.track.id === selectedArtist.track?.id);

      // If there's a next track, go to it
      if (currentIndex !== -1 && currentIndex < sortedTracks.length - 1) {
        const nextTrack = sortedTracks[currentIndex + 1].track;
        const updatedArtist: FeaturedArtist = {
          ...selectedArtist,
          track: nextTrack,
        };
        setSelectedArtist(updatedArtist);
        setShouldAutoPlay(wasPlaying); // Only auto-play if was playing
      }
    },
    [selectedArtist]
  );

  if (featuredArtists.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500">
        <p>No featured artists available at this time.</p>
      </div>
    );
  }

  const showTrackListDrawer = !!selectedArtist?.release?.releaseTracks;
  const currentTrackId = selectedArtist?.track?.id || null;

  return (
    <MediaPlayer className="mb-2">
      <div className="space-y-2 mt-2">
        {/* Featured Artists Carousel */}
        <MediaPlayer.FeaturedArtistCarousel
          featuredArtists={featuredArtists}
          onSelect={handleSelectArtist}
        />
        {selectedArtist && (
          <div
            className="flex justify-center text-sm gap-1 items-center px-2 -mb-1.5"
            dangerouslySetInnerHTML={{
              __html: `${selectedArtist?.release?.title ?? ''} by <strong>${getDisplayName(selectedArtist)}</strong>`,
            }}
          />
        )}
        {showTrackListDrawer && selectedArtist && (
          <MediaPlayer.TrackListDrawer
            artistRelease={selectedArtist as unknown as ArtistRelease}
            currentTrackId={currentTrackId ?? ''}
            onTrackSelect={handleTrackSelect}
          />
        )}
        {/* Selected Artist Details */}
        {selectedArtist && (
          <div className="flex flex-col items-center">
            {/* Cover Art with Audio Controls beneath it */}
            <div className="w-full max-w-xl mx-auto">
              {/* Interactive Cover Art - clickable with play/pause overlay */}
              {getCoverArt(selectedArtist) && (
                <MediaPlayer.InteractiveCoverArt
                  src={getCoverArt(selectedArtist)!}
                  alt={getDisplayName(selectedArtist)}
                  isPlaying={isPlaying}
                  onTogglePlay={handleTogglePlay}
                  className="shadow-lg"
                />
              )}

              {/* Audio Controls - sits directly beneath the image */}
              {selectedArtist.track?.audioUrl && (
                <div className="w-full bg-zinc-900">
                  <MediaPlayer.Controls
                    audioSrc={selectedArtist.track.audioUrl}
                    onPlay={handlePlay}
                    onPause={handlePause}
                    onEnded={handleTrackEnded}
                    onPreviousTrack={handlePreviousTrack}
                    onNextTrack={handleNextTrack}
                    autoPlay={shouldAutoPlay}
                    controlsRef={setPlayerControls}
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
