/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * ReleasePlayer — a client component that wraps the MediaPlayer compound
 * component for release-specific audio playback. Manages play/pause state,
 * track selection, auto-advance, and previous/next navigation.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { MediaPlayer } from '@/app/components/ui/audio/media-player';
import type { MediaPlayerControls } from '@/app/components/ui/audio/media-player';
import type { PublishedReleaseDetail } from '@/lib/types/media-models';

interface ReleasePlayerProps {
  /** Full release data with tracks, artist, and images */
  release: PublishedReleaseDetail;
  /** Whether to auto-play the first track on mount (e.g. from Play button click) */
  autoPlay?: boolean;
}

/**
 * Release media player. Composes MediaPlayer sub-components with
 * release-specific state management for track playback.
 */
export const ReleasePlayer = ({ release, autoPlay = false }: ReleasePlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(autoPlay);
  const [playerControls, setPlayerControls] = useState<MediaPlayerControls | null>(null);
  const hasTriggeredAutoPlay = useRef(false);

  // Trigger play once controls are ready when autoPlay is requested.
  // The MediaPlayer Controls component skips auto-play on the initial source,
  // so we call play() explicitly via the exposed controls API.
  useEffect(() => {
    if (autoPlay && playerControls && !hasTriggeredAutoPlay.current) {
      hasTriggeredAutoPlay.current = true;
      playerControls.play();
    }
  }, [autoPlay, playerControls]);

  const tracks = release.releaseTracks;
  const currentReleaseTrack = tracks[currentTrackIndex];
  const currentTrack = currentReleaseTrack?.track;
  const hasTracks = tracks.length > 0;

  const primaryArtist = release.artistReleases[0]?.artist;

  const coverArtSrc = release.coverArt || release.images[0]?.src || '';
  const coverArtAlt = `${release.title} cover art`;

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleTogglePlay = useCallback(() => {
    playerControls?.toggle();
  }, [playerControls]);

  const handleTrackSelect = useCallback(
    (trackId: string) => {
      const index = tracks.findIndex((rt) => rt.track.id === trackId);
      if (index >= 0) {
        setCurrentTrackIndex(index);
        setShouldAutoPlay(true);
      }
    },
    [tracks]
  );

  const handleTrackEnded = useCallback(() => {
    if (currentTrackIndex < tracks.length - 1) {
      setCurrentTrackIndex((prev) => prev + 1);
      setShouldAutoPlay(true);
    }
  }, [currentTrackIndex, tracks.length]);

  const handlePreviousTrack = useCallback(
    (wasPlaying: boolean) => {
      if (currentTrackIndex > 0) {
        setCurrentTrackIndex((prev) => prev - 1);
        setShouldAutoPlay(wasPlaying);
      }
    },
    [currentTrackIndex]
  );

  const handleNextTrack = useCallback(
    (wasPlaying: boolean) => {
      if (currentTrackIndex < tracks.length - 1) {
        setCurrentTrackIndex((prev) => prev + 1);
        setShouldAutoPlay(wasPlaying);
      }
    },
    [currentTrackIndex, tracks.length]
  );

  return (
    <MediaPlayer className="mb-2">
      <div className="space-y-2 mt-2">
        {hasTracks && currentTrack && primaryArtist && (
          <MediaPlayer.TrackListDrawer
            artistRelease={{ release, artist: primaryArtist }}
            currentTrackId={currentTrack.id}
            onTrackSelect={handleTrackSelect}
          />
        )}

        <div className="flex flex-col items-center">
          {/* Mobile-first: max-w-xl matches landing page, scales up on larger screens */}
          <div className="w-full max-w-xl mx-auto md:max-w-3xl lg:max-w-4xl">
            <MediaPlayer.InteractiveCoverArt
              src={coverArtSrc}
              alt={coverArtAlt}
              isPlaying={isPlaying}
              onTogglePlay={handleTogglePlay}
              className="shadow-lg"
            />

            {hasTracks && currentTrack && primaryArtist ? (
              <>
                <div className="w-full bg-zinc-900">
                  <MediaPlayer.Controls
                    key={`controls-${release.id}`}
                    audioSrc={currentTrack.audioUrl}
                    onPlay={handlePlay}
                    onPause={handlePause}
                    onEnded={handleTrackEnded}
                    onPreviousTrack={handlePreviousTrack}
                    onNextTrack={handleNextTrack}
                    autoPlay={shouldAutoPlay}
                    controlsRef={setPlayerControls}
                  />
                </div>
                <MediaPlayer.InfoTickerTape
                  artistRelease={{ release, artist: primaryArtist }}
                  trackName={currentTrack.title}
                  isPlaying={isPlaying}
                />
              </>
            ) : (
              <div className="flex items-center justify-center py-8 text-zinc-500">
                <p>No playable tracks available.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </MediaPlayer>
  );
};
