/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useMemo, useState } from 'react';

import { MediaPlayer, type MediaPlayerControls } from '@/app/components/ui/audio/media-player';
import type { FeaturedArtist, FeaturedArtistFormatFile } from '@/lib/types/media-models';
import { buildCdnUrl } from '@/lib/utils/cdn-url';

import { ArtistReleaseInfo } from './artist-release-info';
import { DownloadDialog, DownloadTriggerButton } from './download-dialog';

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
    return sortedFiles[0] ?? null;
  }, [currentFileId, sortedFiles]);

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

    setShouldAutoPlay(true); // Auto-play when selecting a new artist from carousel
    setSelectedArtist(artist);
    // Reset to first file of the new artist's format
    const firstFile = artist.digitalFormat?.files?.[0];
    setCurrentFileId(firstFile?.id ?? null);
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
  const currentTrackTitle = currentFile?.title ?? currentFile?.fileName ?? '';

  return (
    <MediaPlayer className="mx-2 mb-2">
      <div className="space-y-2 mt-0">
        {/* Featured Artists Carousel */}
        {featuredArtists.length >= 3 && (
          <MediaPlayer.FeaturedArtistCarousel
            featuredArtists={featuredArtists}
            onSelect={handleSelectArtist}
          />
        )}
        {selectedArtist?.release && (
          <ArtistReleaseInfo
            artistName={getDisplayName(selectedArtist)}
            title={selectedArtist.release.title ?? ''}
            featuredArtists={featuredArtists}
            selectedArtist={selectedArtist}
            setSelectedArtist={setSelectedArtist}
            visibleHeading
          />
        )}
        {showFileListDrawer && selectedArtist?.release && (
          <div className="flex flex-col items-center">
            <MediaPlayer.FormatFileListDrawer
              files={sortedFiles}
              currentFileId={currentFile?.id ?? null}
              onFileSelect={handleFileSelect}
              artistName={getDisplayName(selectedArtist)}
              releaseTitle={selectedArtist.release.title ?? ''}
            />
            <DownloadDialog
              artistName={getDisplayName(selectedArtist)}
              releaseId={selectedArtist.release.id}
              releaseTitle={selectedArtist.release.title ?? ''}
            >
              <DownloadTriggerButton />
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
                      alt={getDisplayName(selectedArtist)}
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
      </div>
    </MediaPlayer>
  );
};
