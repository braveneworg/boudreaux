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

import { DownloadDialog, DownloadTriggerButton } from '@/app/components/download-dialog';
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
import { buildCdnUrl } from '@/lib/utils/cdn-url';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import { getTrackDisplayTitle } from '@/lib/utils/get-track-display-title';
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
        releases.findIndex(
          (ar: ArtistWithPublishedReleases['releases'][number]) =>
            ar.release.id === initialReleaseId
        )
      )
    : 0;

  const [selectedReleaseIndex, setSelectedReleaseIndex] = useState(initialIndex);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(!!initialReleaseId);
  const [playerControls, setPlayerControls] = useState<MediaPlayerControls | null>(null);
  const selectedArtistRelease = releases[selectedReleaseIndex];
  const selectedRelease = selectedArtistRelease?.release;

  const files = useMemo(
    () =>
      selectedRelease?.digitalFormats.find((fmt) => fmt.formatType === 'MP3_320KBPS')?.files ?? [],
    [selectedRelease?.digitalFormats]
  );

  const currentFile = files[currentTrackIndex] ?? null;
  const hasFiles = files.length > 0;

  const audioSrc = useMemo<string | null>(() => {
    if (!currentFile?.s3Key) return null;
    return buildCdnUrl(currentFile.s3Key);
  }, [currentFile?.s3Key]);

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

  const handleFileSelect = useCallback(
    (fileId: string) => {
      const index = files.findIndex((f) => f.id === fileId);
      if (index >= 0) {
        setCurrentTrackIndex(index);
        setShouldAutoPlay(true);
      }
    },
    [files]
  );

  const handleTrackEnded = useCallback(() => {
    if (currentTrackIndex < files.length - 1) {
      setCurrentTrackIndex((prev) => prev + 1);
      setShouldAutoPlay(true);
    }
  }, [currentTrackIndex, files.length]);

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
      if (currentTrackIndex < files.length - 1) {
        setCurrentTrackIndex((prev) => prev + 1);
        setShouldAutoPlay(wasPlaying);
      }
    },
    [currentTrackIndex, files.length]
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
          <CarouselContent className={cn('-ml-2', 'justify-center')}>
            {releases.map((ar: ArtistWithPublishedReleases['releases'][number], index: number) => {
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
        <div className="flex flex-col justify-center text-sm gap-1 items-center px-2 -mb-1.5">
          <ArtistReleaseInfo artistName={artistName} title={selectedRelease.title ?? ''} />
        </div>
      )}

      {/* Media player */}
      <MediaPlayer className="mb-2">
        <div className="mt-2 space-y-1">
          <div className="flex flex-col items-center">
            <div className="mx-auto w-full max-w-xl md:max-w-3xl lg:max-w-4xl">
              <div className="relative">
                <MediaPlayer.InteractiveCoverArt
                  src={coverArtSrc}
                  alt={coverArtAlt}
                  isPlaying={isPlaying}
                  onTogglePlay={handleTogglePlay}
                  className="shadow-lg"
                />
                <DownloadDialog
                  artistName={artistName}
                  releaseId={selectedRelease.id}
                  releaseTitle={selectedRelease.title ?? ''}
                >
                  <DownloadTriggerButton />
                </DownloadDialog>
              </div>

              {hasFiles && currentFile && selectedRelease && audioSrc ? (
                <>
                  <div className="w-full bg-zinc-900">
                    <MediaPlayer.Controls
                      key={`controls-${selectedRelease.id}`}
                      audioSrc={audioSrc}
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
                    trackName={getTrackDisplayTitle(currentFile.title, currentFile.fileName)}
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

          {hasFiles && currentFile && selectedRelease && (
            <MediaPlayer.FormatFileListDrawer
              files={files}
              currentFileId={currentFile.id}
              onFileSelect={handleFileSelect}
              artistName={artistName}
              releaseTitle={selectedRelease.title ?? ''}
            />
          )}
        </div>
      </MediaPlayer>
    </div>
  );
};
