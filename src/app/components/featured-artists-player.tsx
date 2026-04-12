/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useMemo, useState } from 'react';

import nextDynamic from 'next/dynamic';

import { MediaPlayer, type MediaPlayerControls } from '@/app/components/ui/audio/media-player';
import type { FeaturedArtist, FeaturedArtistFormatFile } from '@/lib/types/media-models';
import { buildCdnUrl } from '@/lib/utils/cdn-url';
import { getFeaturedArtistDisplayName } from '@/lib/utils/get-featured-artist-display-name';
import { getTrackDisplayTitle } from '@/lib/utils/get-track-display-title';

import { ArtistReleaseInfo } from './artist-release-info';
import { DownloadTriggerButton } from './download-trigger-button';

const DownloadDialog = nextDynamic(
  () => import('./download-dialog').then((mod) => ({ default: mod.DownloadDialog })),
  { ssr: false }
);

interface FeaturedArtistsPlayerProps {
  featuredArtists: FeaturedArtist[];
}

/**
 * Client component that displays the featured artists carousel with media player controls.
 * @param featuredArtists - Array of featured artists to display
 */
export const FeaturedArtistsPlayer = ({ featuredArtists }: FeaturedArtistsPlayerProps) => {
  /** Only show featured artists with a resolvable display name */
  const displayableArtists = useMemo(
    () => featuredArtists.filter((fa) => getFeaturedArtistDisplayName(fa) !== null),
    [featuredArtists]
  );

  const [selectedArtist, setSelectedArtist] = useState<FeaturedArtist | null>(
    displayableArtists.length > 0 ? displayableArtists[0] : null
  );
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(false);
  const [playerControls, setPlayerControls] = useState<MediaPlayerControls | null>(null);

  /** Sorted format files for the selected artist's digital format */
  const sortedFiles = useMemo<FeaturedArtistFormatFile[]>(() => {
    const files = selectedArtist?.digitalFormat?.files;
    if (!files || files.length === 0) return [];
    return [...files].sort((a, b) => a.trackNumber - b.trackNumber);
  }, [selectedArtist?.digitalFormat?.files]);

  /** The currently playing format file */
  const currentFile = useMemo<FeaturedArtistFormatFile | null>(() => {
    if (currentFileId) {
      return sortedFiles.find((f) => f.id === currentFileId) ?? sortedFiles[0] ?? null;
    }
    // Default to the featured track if set, otherwise the first track
    if (selectedArtist?.featuredTrackNumber != null) {
      const featured = sortedFiles.find(
        (f) => f.trackNumber === selectedArtist.featuredTrackNumber
      );
      if (featured) return featured;
    }
    return sortedFiles[0] ?? null;
  }, [currentFileId, sortedFiles, selectedArtist?.featuredTrackNumber]);

  /** CDN URL for the current file's audio */
  const audioSrc = useMemo<string | null>(() => {
    if (!currentFile?.s3Key) return null;
    return buildCdnUrl(currentFile.s3Key);
  }, [currentFile?.s3Key]);

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

    setShouldAutoPlay(true); // Auto-play when selecting a new artist from carousel
    setSelectedArtist(artist);
    // Reset to the featured track if set, otherwise the first file
    const files = artist.digitalFormat?.files ?? [];
    const sorted = [...files].sort((a, b) => a.trackNumber - b.trackNumber);
    let targetFile = sorted[0];
    if (artist.featuredTrackNumber != null) {
      const featured = sorted.find((f) => f.trackNumber === artist.featuredTrackNumber);
      if (featured) targetFile = featured;
    }
    setCurrentFileId(targetFile?.id ?? null);
  };

  /**
   * Handle file selection from the format file list drawer
   */
  const handleFileSelect = useCallback(
    (fileId: string) => {
      const file = sortedFiles.find((f) => f.id === fileId);
      if (file) {
        setCurrentFileId(file.id);
        setShouldAutoPlay(true);
      }
    },
    [sortedFiles]
  );

  /**
   * Handle track ended - auto-advance to next file if available
   */
  const handleTrackEnded = useCallback(() => {
    /* v8 ignore next -- defensive guard: handler only fires when a track is playing */
    if (!currentFile || sortedFiles.length === 0) return;

    const currentIndex = sortedFiles.findIndex((f) => f.id === currentFile.id);

    // If there's a next file, play it
    if (currentIndex !== -1 && currentIndex < sortedFiles.length - 1) {
      const nextFile = sortedFiles[currentIndex + 1];
      setCurrentFileId(nextFile.id);
      setShouldAutoPlay(true);
    }
  }, [currentFile, sortedFiles]);

  /**
   * Handle previous track button - go to previous file in format if available
   */
  const handlePreviousTrack = useCallback(
    (wasPlaying: boolean) => {
      /* v8 ignore next -- defensive guard: handler only fires when a track is playing */
      if (!currentFile || sortedFiles.length === 0) return;

      const currentIndex = sortedFiles.findIndex((f) => f.id === currentFile.id);

      if (currentIndex > 0) {
        const prevFile = sortedFiles[currentIndex - 1];
        setCurrentFileId(prevFile.id);
        setShouldAutoPlay(wasPlaying);
      }
    },
    [currentFile, sortedFiles]
  );

  /**
   * Handle next track button - go to next file in format if available
   */
  const handleNextTrack = useCallback(
    (wasPlaying: boolean) => {
      /* v8 ignore next -- defensive guard: handler only fires when a track is playing */
      if (!currentFile || sortedFiles.length === 0) return;

      const currentIndex = sortedFiles.findIndex((f) => f.id === currentFile.id);

      if (currentIndex !== -1 && currentIndex < sortedFiles.length - 1) {
        const nextFile = sortedFiles[currentIndex + 1];
        setCurrentFileId(nextFile.id);
        setShouldAutoPlay(wasPlaying);
      }
    },
    [currentFile, sortedFiles]
  );

  if (featuredArtists.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500">
        <p>No featured artists available at this time.</p>
      </div>
    );
  }

  const showFileListDrawer = sortedFiles.length > 0;
  const currentTrackTitle = currentFile
    ? getTrackDisplayTitle(currentFile.title, currentFile.fileName)
    : '';

  return (
    <MediaPlayer className="mx-0 mb-2">
      <div className="space-y-2 mt-0">
        {/* Featured Artists Carousel */}
        {displayableArtists.length >= 3 && (
          <MediaPlayer.FeaturedArtistCarousel
            featuredArtists={displayableArtists}
            onSelect={handleSelectArtist}
          />
        )}
        {showFileListDrawer && selectedArtist?.release && (
          <div className="flex flex-col items-center">
            <MediaPlayer.FormatFileListDrawer
              files={sortedFiles}
              currentFileId={currentFile?.id ?? null}
              onFileSelect={handleFileSelect}
              artistName={getFeaturedArtistDisplayName(selectedArtist) ?? ''}
              releaseTitle={selectedArtist.release.title ?? ''}
              featuredTrackNumber={selectedArtist.featuredTrackNumber ?? undefined}
            />
            <DownloadDialog
              artistName={getFeaturedArtistDisplayName(selectedArtist) ?? ''}
              releaseId={selectedArtist.release.id}
              releaseTitle={selectedArtist.release.title ?? ''}
            >
              <DownloadTriggerButton className="mb-2 min-h-10" label="Download release" />
            </DownloadDialog>
          </div>
        )}

        {/* Selected Artist Details */}
        {selectedArtist && (
          <div className="flex flex-col items-center">
            {/* Cover Art with Audio Controls beneath it */}
            <div className="w-full max-w-xl mx-auto">
              {/* Interactive Cover Art - clickable with play/pause overlay */}
              {(() => {
                const coverArt = getCoverArt(selectedArtist);
                if (!coverArt) return null;
                return (
                  <div className="relative">
                    <MediaPlayer.InteractiveCoverArt
                      src={coverArt}
                      alt={getFeaturedArtistDisplayName(selectedArtist) ?? ''}
                      isPlaying={isPlaying}
                      onTogglePlay={handleTogglePlay}
                      className="shadow-lg"
                    />
                  </div>
                );
              })()}

              {/* Audio Controls - sits directly beneath the image */}
              {audioSrc && (
                <div className="w-full bg-zinc-900">
                  <MediaPlayer.Controls
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
              )}

              {/* Info Ticker Tape - beneath the controls */}
              {currentTrackTitle && (
                <MediaPlayer.InfoTickerTape
                  featuredArtist={selectedArtist}
                  isPlaying={isPlaying}
                  trackTitle={currentTrackTitle}
                />
              )}
            </div>
          </div>
        )}
        {selectedArtist?.release && (
          <ArtistReleaseInfo
            artistName={getFeaturedArtistDisplayName(selectedArtist) ?? ''}
            title={selectedArtist.release.title ?? ''}
            featuredArtists={displayableArtists}
            selectedArtist={selectedArtist}
            setSelectedArtist={setSelectedArtist}
            visibleHeading
          />
        )}
      </div>
    </MediaPlayer>
  );
};
