/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * ReleasePlayer — a client component that wraps the MediaPlayer compound
 * component for release-specific audio playback. Manages play/pause state,
 * track selection, auto-advance, and previous/next navigation.
 * Audio is sourced from the MP3_320KBPS ReleaseDigitalFormat files.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Download } from 'lucide-react';

import { DeferredDownloadDialog } from '@/app/components/deferred-download-dialog';
import { MediaActionLink } from '@/app/components/media-action-link';
import { MediaPlayer } from '@/app/components/ui/audio/media-player';
import type { MediaPlayerControls } from '@/app/components/ui/audio/media-player';
import type { PublishedReleaseDetail } from '@/lib/types/media-models';
import { resolveStreamUrl } from '@/lib/utils/cdn-url';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import { getTrackDisplayTitle } from '@/lib/utils/get-track-display-title';

interface ReleasePlayerProps {
  /** Full release data with digital format files, artist, and images */
  release: PublishedReleaseDetail;
  /** Whether to auto-play the first track on mount (e.g. from Play button click) */
  autoPlay?: boolean;
  releaseId: string;
  releaseTitle?: string;
}

/**
 * Release media player. Composes MediaPlayer sub-components with
 * release-specific state management for track playback.
 * Reads audio from the MP3_320KBPS digital format files array.
 */
export const ReleasePlayer = ({
  release,
  autoPlay = false,
  releaseId,
  releaseTitle,
}: ReleasePlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
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

  // Use MP3_320KBPS files as the playback track list
  const files = useMemo(
    () => release.digitalFormats.find((fmt) => fmt.formatType === 'MP3_320KBPS')?.files ?? [],
    [release.digitalFormats]
  );

  const currentFile = files[currentFileIndex] ?? null;
  const hasFiles = files.length > 0;

  const audioSrc = useMemo<string | null>(() => {
    if (!currentFile) return null;
    return resolveStreamUrl(currentFile);
  }, [currentFile]);

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

  const handleFileSelect = useCallback(
    (fileId: string) => {
      const index = files.findIndex((f) => f.id === fileId);
      if (index >= 0) {
        setCurrentFileIndex(index);
        setShouldAutoPlay(true);
      }
    },
    [files]
  );

  const handleTrackEnded = useCallback(() => {
    if (currentFileIndex < files.length - 1) {
      setCurrentFileIndex((prev) => prev + 1);
      setShouldAutoPlay(true);
    }
  }, [currentFileIndex, files.length]);

  const handlePreviousTrack = useCallback(
    (wasPlaying: boolean) => {
      if (currentFileIndex > 0) {
        setCurrentFileIndex((prev) => prev - 1);
        setShouldAutoPlay(wasPlaying);
      }
    },
    [currentFileIndex]
  );

  const handleNextTrack = useCallback(
    (wasPlaying: boolean) => {
      if (currentFileIndex < files.length - 1) {
        setCurrentFileIndex((prev) => prev + 1);
        setShouldAutoPlay(wasPlaying);
      }
    },
    [currentFileIndex, files.length]
  );

  return (
    <MediaPlayer className="mb-2">
      <div className="mt-2 space-y-2">
        {hasFiles && currentFile && primaryArtist && (
          <MediaPlayer.FormatFileListDrawer
            files={files}
            currentFileId={currentFile.id}
            onFileSelect={handleFileSelect}
            artistName={getArtistDisplayName(primaryArtist)}
            releaseTitle={release.title ?? ''}
            downloadTrigger={
              <DeferredDownloadDialog
                artistName={getArtistDisplayName(primaryArtist)}
                releaseId={releaseId}
                releaseTitle={releaseTitle ?? ''}
              >
                <MediaActionLink icon={Download} label="Download" />
              </DeferredDownloadDialog>
            }
          />
        )}

        <div className="flex flex-col items-center">
          {/* Mobile-first: max-w-xl matches landing page, scales up on larger screens */}
          <div className="mx-auto w-full max-w-xl md:max-w-3xl lg:max-w-4xl">
            <div className="relative">
              <MediaPlayer.InteractiveCoverArt
                src={coverArtSrc}
                alt={coverArtAlt}
                isPlaying={isPlaying}
                onTogglePlay={handleTogglePlay}
                className="shadow-lg"
                priority
              />
            </div>

            {hasFiles && currentFile && primaryArtist && audioSrc ? (
              <>
                <div className="w-full bg-zinc-900">
                  <MediaPlayer.Controls
                    key={`controls-${release.id}`}
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
                  artistRelease={{ release, artist: primaryArtist }}
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
      </div>
    </MediaPlayer>
  );
};
