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

import { useTrackNavigation } from './use-track-navigation';

interface ReleasePlayerProps {
  /** Full release data with digital format files, artist, and images */
  release: PublishedReleaseDetail;
  /** Whether to auto-play the first track on mount (e.g. from Play button click) */
  autoPlay?: boolean;
  releaseId: string;
  releaseTitle?: string;
}

type ReleasePrimaryArtist = NonNullable<PublishedReleaseDetail['artistReleases'][number]['artist']>;
type ReleaseTrackFile = PublishedReleaseDetail['digitalFormats'][number]['files'][number];

interface ReleaseFileListDrawerProps {
  release: PublishedReleaseDetail;
  files: ReleaseTrackFile[];
  currentFile: ReleaseTrackFile;
  primaryArtist: ReleasePrimaryArtist;
  releaseId: string;
  releaseTitle?: string;
  onFileSelect: (fileId: string) => void;
}

/**
 * Track-list drawer for the release player, with a download trigger that opens
 * the {@link DeferredDownloadDialog} for this release.
 */
const ReleaseFileListDrawer = ({
  release,
  files,
  currentFile,
  primaryArtist,
  releaseId,
  releaseTitle,
  onFileSelect,
}: ReleaseFileListDrawerProps) => (
  <MediaPlayer.FormatFileListDrawer
    files={files}
    currentFileId={currentFile.id}
    onFileSelect={onFileSelect}
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
);

interface ReleasePlayerControlsProps {
  release: PublishedReleaseDetail;
  primaryArtist: ReleasePrimaryArtist;
  currentFile: ReleaseTrackFile;
  audioSrc: string;
  isPlaying: boolean;
  shouldAutoPlay: boolean;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onPreviousTrack: (wasPlaying: boolean) => void;
  onNextTrack: (wasPlaying: boolean) => void;
  setPlayerControls: (controls: MediaPlayerControls | null) => void;
}

/** Audio controls + info ticker shown when a playable track + source are ready. */
const ReleasePlayerControls = ({
  release,
  primaryArtist,
  currentFile,
  audioSrc,
  isPlaying,
  shouldAutoPlay,
  onPlay,
  onPause,
  onEnded,
  onPreviousTrack,
  onNextTrack,
  setPlayerControls,
}: ReleasePlayerControlsProps) => (
  <>
    <div className="w-full bg-zinc-900">
      <MediaPlayer.Controls
        key={`controls-${release.id}`}
        audioSrc={audioSrc}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
        onPreviousTrack={onPreviousTrack}
        onNextTrack={onNextTrack}
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
);

interface ReleasePlayerBodyProps {
  release: PublishedReleaseDetail;
  primaryArtist: ReleasePrimaryArtist | undefined;
  files: ReleaseTrackFile[];
  currentFile: ReleaseTrackFile | null;
  hasFiles: boolean;
  audioSrc: string | null;
  coverArtSrc: string;
  coverArtAlt: string;
  isPlaying: boolean;
  shouldAutoPlay: boolean;
  releaseId: string;
  releaseTitle?: string;
  onTogglePlay: () => void;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onPreviousTrack: (wasPlaying: boolean) => void;
  onNextTrack: (wasPlaying: boolean) => void;
  onFileSelect: (fileId: string) => void;
  setPlayerControls: (controls: MediaPlayerControls | null) => void;
}

/**
 * Interactive body of the release player: the track-list drawer, interactive
 * cover art, and the controls/ticker (or an empty-state). Split out of
 * {@link ReleasePlayer} so the parent stays focused on state derivation.
 */
const ReleasePlayerBody = ({
  release,
  primaryArtist,
  files,
  currentFile,
  hasFiles,
  audioSrc,
  coverArtSrc,
  coverArtAlt,
  isPlaying,
  shouldAutoPlay,
  releaseId,
  releaseTitle,
  onTogglePlay,
  onPlay,
  onPause,
  onEnded,
  onPreviousTrack,
  onNextTrack,
  onFileSelect,
  setPlayerControls,
}: ReleasePlayerBodyProps) => (
  <MediaPlayer className="mb-2">
    <div className="mt-2 space-y-2">
      {hasFiles && currentFile && primaryArtist && (
        <ReleaseFileListDrawer
          release={release}
          files={files}
          currentFile={currentFile}
          primaryArtist={primaryArtist}
          releaseId={releaseId}
          releaseTitle={releaseTitle}
          onFileSelect={onFileSelect}
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
              onTogglePlay={onTogglePlay}
              className="shadow-lg"
              priority
            />
          </div>

          {hasFiles && currentFile && primaryArtist && audioSrc ? (
            <ReleasePlayerControls
              release={release}
              primaryArtist={primaryArtist}
              currentFile={currentFile}
              audioSrc={audioSrc}
              isPlaying={isPlaying}
              shouldAutoPlay={shouldAutoPlay}
              onPlay={onPlay}
              onPause={onPause}
              onEnded={onEnded}
              onPreviousTrack={onPreviousTrack}
              onNextTrack={onNextTrack}
              setPlayerControls={setPlayerControls}
            />
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

  const {
    currentIndex: currentFileIndex,
    shouldAutoPlay,
    handleFileSelect,
    handleTrackEnded,
    handlePreviousTrack,
    handleNextTrack,
  } = useTrackNavigation(files, autoPlay);

  const currentFile = files.at(currentFileIndex) ?? null;
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

  return (
    <ReleasePlayerBody
      release={release}
      primaryArtist={primaryArtist}
      files={files}
      currentFile={currentFile}
      hasFiles={hasFiles}
      audioSrc={audioSrc}
      coverArtSrc={coverArtSrc}
      coverArtAlt={coverArtAlt}
      isPlaying={isPlaying}
      shouldAutoPlay={shouldAutoPlay}
      releaseId={releaseId}
      releaseTitle={releaseTitle}
      onTogglePlay={handleTogglePlay}
      onPlay={handlePlay}
      onPause={handlePause}
      onEnded={handleTrackEnded}
      onPreviousTrack={handlePreviousTrack}
      onNextTrack={handleNextTrack}
      onFileSelect={handleFileSelect}
      setPlayerControls={setPlayerControls}
    />
  );
};
