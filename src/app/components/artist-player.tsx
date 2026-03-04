/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * ArtistPlayer — a client component that displays a release thumbnail carousel
 * and MediaPlayer for an artist's published releases. Tapping a release
 * thumbnail starts playing the first track on that release.
 */
'use client';

import { useCallback, useMemo, useState } from 'react';

import Image from 'next/image';

import { MediaPlayer } from '@/app/components/ui/audio/media-player';
import type { MediaPlayerControls } from '@/app/components/ui/audio/media-player';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/app/components/ui/carousel';
import type { ArtistWithPublishedReleases } from '@/lib/types/media-models';
import { cn } from '@/lib/utils';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import { getReleaseCoverArt } from '@/lib/utils/release-helpers';

import { ArtistReleaseInfo } from './artist-release-info';

interface ArtistPlayerProps {
  /** Artist with published releases and tracks */
  artist: ArtistWithPublishedReleases;
  /** Optional release ID to initially select (e.g. from search) */
  initialReleaseId?: string;
}

/**
 * Artist media player. Composes a release thumbnail carousel with
 * MediaPlayer sub-components for audio playback.
 */
export const ArtistPlayer = ({ artist, initialReleaseId }: ArtistPlayerProps) => {
  const releases = artist.releases;

  const initialIndex = initialReleaseId
    ? Math.max(
        0,
        releases.findIndex((ar) => ar.release.id === initialReleaseId)
      )
    : 0;

  const [selectedReleaseIndex, setSelectedReleaseIndex] = useState(initialIndex);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(!!initialReleaseId);
  const [playerControls, setPlayerControls] = useState<MediaPlayerControls | null>(null);
  const selectedArtistRelease = releases[selectedReleaseIndex];
  const selectedRelease = selectedArtistRelease?.release;

  const tracks = useMemo(
    () => selectedRelease?.releaseTracks ?? [],
    [selectedRelease?.releaseTracks]
  );
  const currentReleaseTrack = tracks[currentTrackIndex];
  const currentTrack = currentReleaseTrack?.track;
  const hasTracks = tracks.length > 0;

  const artistName = getArtistDisplayName(artist);

  const coverArt = selectedRelease ? getReleaseCoverArt(selectedRelease) : null;
  const coverArtSrc = coverArt?.src ?? '';
  const coverArtAlt = coverArt?.alt ?? `${artistName} cover art`;

  const handleReleaseSelect = useCallback(
    (index: number) => {
      if (index === selectedReleaseIndex) {
        // Tapping the already-selected release toggles play/pause
        playerControls?.toggle();
        return;
      }
      setSelectedReleaseIndex(index);
      setCurrentTrackIndex(0);
      setShouldAutoPlay(true);
    },
    [selectedReleaseIndex, playerControls]
  );

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

  if (releases.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <p>No releases available for this artist.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Release thumbnail carousel — shown when 2+ releases */}
      {releases.length >= 2 && (
        <Carousel opts={{ align: 'start', loop: false }} aria-label={`Releases by ${artistName}`}>
          <CarouselContent className={cn('-ml-2', releases.length === 2 && 'justify-center')}>
            {releases.map((ar, index) => {
              const releaseCoverArt = getReleaseCoverArt(ar.release);
              const isSelected = index === selectedReleaseIndex;

              return (
                <CarouselItem key={ar.release.id} className="basis-auto pl-2">
                  <button
                    type="button"
                    onClick={() => handleReleaseSelect(index)}
                    className={cn(
                      'relative overflow-hidden rounded-md transition-all',
                      isSelected && 'ring-2 ring-primary'
                    )}
                    aria-label={`Play ${ar.release.title}`}
                    aria-pressed={isSelected}
                  >
                    {releaseCoverArt ? (
                      <Image
                        src={releaseCoverArt.src}
                        alt={releaseCoverArt.alt}
                        width={80}
                        height={80}
                        className="size-20 object-cover"
                      />
                    ) : (
                      <div className="flex size-20 items-center justify-center bg-muted text-xs text-muted-foreground">
                        {ar.release.title.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </button>
                </CarouselItem>
              );
            })}
          </CarouselContent>
          {releases.length > 3 && (
            <>
              <CarouselPrevious />
              <CarouselNext />
            </>
          )}
        </Carousel>
      )}

      {/* Artist + release header */}
      {selectedRelease && (
        <article className="flex flex-col justify-center text-sm gap-1 items-center px-2 -mb-1.5">
          {releases.length >= 2 && getReleaseCoverArt(selectedRelease) && (
            <MediaPlayer.CoverArtView artistRelease={{ release: selectedRelease, artist }} />
          )}
          <ArtistReleaseInfo artistName={artistName} title={selectedRelease.title ?? ''} />
        </article>
      )}

      {/* Media player */}
      <MediaPlayer className="mb-2">
        <div className="mt-2 space-y-2">
          <div className="flex flex-col items-center">
            <div className="mx-auto w-full max-w-xl md:max-w-3xl lg:max-w-4xl">
              <MediaPlayer.InteractiveCoverArt
                src={coverArtSrc}
                alt={coverArtAlt}
                isPlaying={isPlaying}
                onTogglePlay={handleTogglePlay}
                className="shadow-lg"
              />

              {hasTracks && currentTrack && selectedRelease ? (
                <>
                  <div className="w-full bg-zinc-900">
                    <MediaPlayer.Controls
                      key={`controls-${selectedRelease.id}`}
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
                    artistRelease={{ release: selectedRelease, artist }}
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

          {hasTracks && currentTrack && selectedRelease && (
            <MediaPlayer.TrackListDrawer
              artistName={artistName}
              artistRelease={{ release: selectedRelease, artist }}
              currentTrackId={currentTrack.id}
              onTrackSelect={handleTrackSelect}
            />
          )}
        </div>
      </MediaPlayer>
    </div>
  );
};
