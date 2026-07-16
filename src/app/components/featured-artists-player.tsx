/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Download } from 'lucide-react';

import { MediaPlayer, type MediaPlayerControls } from '@/app/components/ui/audio/media-player';
import type { FeaturedArtist, FeaturedArtistFormatFile } from '@/lib/types/media-models';
import { resolveStreamUrl } from '@/lib/utils/cdn-url';
import { getFeaturedArtistCoverArt } from '@/lib/utils/get-featured-artist-cover-art';
import { getFeaturedArtistDisplayName } from '@/lib/utils/get-featured-artist-display-name';
import { getTrackDisplayTitle } from '@/lib/utils/get-track-display-title';

import { DeferredDownloadDialog } from './deferred-download-dialog';
import { MediaActionLink } from './media-action-link';
import { NowPlayingHeading } from './now-playing-heading';
import { AddToPlaylistMenu } from './playlists/add-to-playlist-menu';
import { trackMediaItem } from './playlists/player-media-item';
import { ReleaseShareWidget } from './release-share-widget';

interface FeaturedArtistsPlayerProps {
  featuredArtists: FeaturedArtist[];
}

/** Return a copy of `files` sorted ascending by track number (non-mutating). */
const sortFilesByTrackNumber = (
  files: readonly FeaturedArtistFormatFile[]
): FeaturedArtistFormatFile[] => [...files].sort((a, b) => a.trackNumber - b.trackNumber);

/**
 * Pick the file to start on for a freshly-selected artist: the featured track
 * when `featuredTrackNumber` is set and present, otherwise the first sorted
 * file. Returns its id, or `null` when there are no files.
 */
const resolveInitialFileId = (
  files: readonly FeaturedArtistFormatFile[],
  featuredTrackNumber: number | null | undefined
): string | null => {
  const sorted = sortFilesByTrackNumber(files);
  if (featuredTrackNumber != null) {
    const featured = sorted.find((f) => f.trackNumber === featuredTrackNumber);
    if (featured) return featured.id;
  }
  return sorted[0]?.id ?? null;
};

type FeaturedRelease = NonNullable<FeaturedArtist['release']>;

interface FeaturedAddToPlaylistProps {
  currentFile: FeaturedArtistFormatFile;
  release: FeaturedRelease;
  artistName: string | null;
  coverArt: string | null;
}

/**
 * Session-gated "add the currently-playing track to a playlist" kebab, pinned to
 * the top-right of the cover art. Builds the {@link PlaylistSearchItem} snapshot
 * from the active file and delegates the menu UI to {@link AddToPlaylistMenu}.
 * The trigger uses a white icon over a semi-opaque dark pill so it stays legible
 * against arbitrary cover imagery.
 */
const FeaturedAddToPlaylist = ({
  currentFile,
  release,
  artistName,
  coverArt,
}: FeaturedAddToPlaylistProps) => {
  const mediaItem = trackMediaItem({
    trackFileId: currentFile.id,
    releaseId: release.id,
    title: getTrackDisplayTitle(currentFile.title, currentFile.fileName),
    artistName,
    coverArt,
    duration: currentFile.duration ?? null,
  });

  return (
    <AddToPlaylistMenu
      item={mediaItem}
      className="absolute top-1 right-1 z-10 rounded-full bg-black/40 p-1 text-white hover:bg-black/60 hover:text-white"
    />
  );
};

interface FeaturedArtistTrackRowProps {
  selectedArtist: FeaturedArtist;
  release: FeaturedRelease;
  sortedFiles: FeaturedArtistFormatFile[];
  currentFileId: string | null;
  onFileSelect: (fileId: string) => void;
}

/**
 * The track-list drawer (with download trigger) plus the now-playing heading
 * for the selected featured artist. Only rendered when the artist has a release
 * and at least one playable file.
 */
const FeaturedArtistTrackRow = ({
  selectedArtist,
  release,
  sortedFiles,
  currentFileId,
  onFileSelect,
}: FeaturedArtistTrackRowProps) => {
  const displayName = getFeaturedArtistDisplayName(selectedArtist) ?? '';
  const releaseTitle = release.title ?? '';
  return (
    <>
      <MediaPlayer.FormatFileListDrawer
        files={sortedFiles}
        currentFileId={currentFileId}
        onFileSelect={onFileSelect}
        artistName={displayName}
        releaseTitle={releaseTitle}
        featuredTrackNumber={selectedArtist.featuredTrackNumber ?? undefined}
        downloadTrigger={
          <DeferredDownloadDialog
            artistName={displayName}
            releaseId={release.id}
            releaseTitle={releaseTitle}
          >
            <MediaActionLink icon={Download} label="Download" />
          </DeferredDownloadDialog>
        }
      />
      <NowPlayingHeading artistName={displayName} title={releaseTitle} visibleHeading />
    </>
  );
};

interface FeaturedArtistTrackRowSlotProps {
  show: boolean;
  selectedArtist: FeaturedArtist | null;
  sortedFiles: FeaturedArtistFormatFile[];
  currentFileId: string | null;
  onFileSelect: (fileId: string) => void;
}

/**
 * Guards rendering of {@link FeaturedArtistTrackRow}: only shows the track row
 * when there are files (`show`) and the selected artist has a release.
 */
const FeaturedArtistTrackRowSlot = ({
  show,
  selectedArtist,
  sortedFiles,
  currentFileId,
  onFileSelect,
}: FeaturedArtistTrackRowSlotProps) => {
  if (!show || !selectedArtist?.release) return null;
  return (
    <FeaturedArtistTrackRow
      selectedArtist={selectedArtist}
      release={selectedArtist.release}
      sortedFiles={sortedFiles}
      currentFileId={currentFileId}
      onFileSelect={onFileSelect}
    />
  );
};

interface FeaturedArtistDetailsProps {
  selectedArtist: FeaturedArtist;
  currentFile: FeaturedArtistFormatFile | null;
  audioSrc: string | null;
  currentTrackTitle: string;
  isPlaying: boolean;
  shouldAutoPlay: boolean;
  onTogglePlay: () => void;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onPreviousTrack: (wasPlaying: boolean) => void;
  onNextTrack: (wasPlaying: boolean) => void;
  setPlayerControls: (controls: MediaPlayerControls | null) => void;
}

/**
 * Selected-artist detail stack: interactive cover art, the audio controls
 * (once a source resolves), and the scrolling info ticker. Each slot reserves a
 * stable min-height to avoid layout shift during lazy load.
 */
const FeaturedArtistDetails = ({
  selectedArtist,
  currentFile,
  audioSrc,
  currentTrackTitle,
  isPlaying,
  shouldAutoPlay,
  onTogglePlay,
  onPlay,
  onPause,
  onEnded,
  onPreviousTrack,
  onNextTrack,
  setPlayerControls,
}: FeaturedArtistDetailsProps) => {
  const coverArt = getFeaturedArtistCoverArt(selectedArtist);
  const artistName = getFeaturedArtistDisplayName(selectedArtist);
  const displayName = artistName ?? '';
  const release = selectedArtist.release;

  return (
    <div className="flex flex-col items-center">
      {/* lg: the player sits inside the carousel's arrow gutters (2rem each
          side) plus a 1rem inset, so its edges line up with the thumbnail
          strip above it while both sit in from the column edge. Keep in sync
          with the carousel's lg:max-w in media-player.tsx (player = carousel
          inset + 4rem for the arrow gutters). */}
      <div className="mx-auto w-full max-w-xl border-2 border-black lg:max-w-[calc(100%_-_6rem)]">
        {/* Interactive Cover Art — aspect-square container prevents CLS.
            `relative` anchors the add-to-playlist kebab overlay. */}
        <div className="bg-muted relative aspect-square w-full overflow-hidden">
          {coverArt && (
            <MediaPlayer.InteractiveCoverArt
              src={coverArt}
              alt={displayName}
              isPlaying={isPlaying}
              onTogglePlay={onTogglePlay}
              // No `priority`: on mobile this cover renders below the fold,
              // so `priority`'s unconditional preload would be flagged
              // "preloaded but not used". The home page instead emits a
              // `(min-width: 1024px)`-scoped preload for the initial
              // artist's cover (see (home)/page.tsx) that cache-feeds this
              // img on desktop, where it's the LCP element.
            />
          )}
          {currentFile && release && (
            <FeaturedAddToPlaylist
              currentFile={currentFile}
              release={release}
              artistName={artistName}
              coverArt={coverArt}
            />
          )}
        </div>

        {/* Audio Controls — stable min-height prevents CLS during Video.js lazy load */}
        <div className="min-h-16 w-full bg-zinc-900">
          {audioSrc && (
            <MediaPlayer.Controls
              audioSrc={audioSrc}
              onPlay={onPlay}
              onPause={onPause}
              onEnded={onEnded}
              onPreviousTrack={onPreviousTrack}
              onNextTrack={onNextTrack}
              autoPlay={shouldAutoPlay}
              controlsRef={setPlayerControls}
            />
          )}
        </div>

        {/* Info Ticker Tape — stable min-height */}
        <div className="min-h-10 w-full bg-zinc-800">
          {currentTrackTitle && (
            <MediaPlayer.InfoTickerTape
              featuredArtist={selectedArtist}
              isPlaying={isPlaying}
              trackTitle={currentTrackTitle}
            />
          )}
        </div>
      </div>
    </div>
  );
};

interface FeaturedArtistsPlayerBodyProps {
  displayableArtists: FeaturedArtist[];
  selectedArtist: FeaturedArtist | null;
  setSelectedArtist: (artist: FeaturedArtist | null) => void;
  sortedFiles: FeaturedArtistFormatFile[];
  currentFile: FeaturedArtistFormatFile | null;
  audioSrc: string | null;
  currentTrackTitle: string;
  showFileListDrawer: boolean;
  isPlaying: boolean;
  shouldAutoPlay: boolean;
  onSelectArtist: (artist: FeaturedArtist, options?: { autoPlay?: boolean }) => void;
  onFileSelect: (fileId: string) => void;
  onTogglePlay: () => void;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onPreviousTrack: (wasPlaying: boolean) => void;
  onNextTrack: (wasPlaying: boolean) => void;
  setPlayerControls: (controls: MediaPlayerControls | null) => void;
}

/**
 * Interactive body of the featured-artists player: the artist carousel (3+
 * artists), the track row, the selected-artist details, and the share widget.
 * Split out of {@link FeaturedArtistsPlayer} so the parent stays focused on
 * state and derivation.
 */
const FeaturedArtistsPlayerBody = ({
  displayableArtists,
  selectedArtist,
  setSelectedArtist,
  sortedFiles,
  currentFile,
  audioSrc,
  currentTrackTitle,
  showFileListDrawer,
  isPlaying,
  shouldAutoPlay,
  onSelectArtist,
  onFileSelect,
  onTogglePlay,
  onPlay,
  onPause,
  onEnded,
  onPreviousTrack,
  onNextTrack,
  setPlayerControls,
}: FeaturedArtistsPlayerBodyProps) => {
  const currentFileId = currentFile?.id ?? null;

  return (
    <MediaPlayer className="mx-0 mb-2">
      <div className="mt-0 space-y-2">
        {/* Featured Artists Carousel — reserve stable height even when < 3 artists */}
        <div className="min-h-[76px]">
          {displayableArtists.length >= 3 && (
            <MediaPlayer.FeaturedArtistCarousel
              featuredArtists={displayableArtists}
              selectedArtistId={selectedArtist?.id}
              onSelect={onSelectArtist}
            />
          )}
        </div>
        {/* Track list / download link row + now-playing heading.
            -mt-1 cancels half of the parent's space-y-2 so the row sits closer
            to the carousel above. min-h-10 reserves stable height across
            loading + dynamic-dialog states to prevent CLS. */}
        <div className="-mt-1 flex min-h-10 flex-col items-center">
          <FeaturedArtistTrackRowSlot
            show={showFileListDrawer}
            selectedArtist={selectedArtist}
            sortedFiles={sortedFiles}
            currentFileId={currentFileId}
            onFileSelect={onFileSelect}
          />
        </div>

        {/* Selected Artist Details — cover art + controls + ticker */}
        {selectedArtist && (
          <FeaturedArtistDetails
            selectedArtist={selectedArtist}
            currentFile={currentFile}
            audioSrc={audioSrc}
            currentTrackTitle={currentTrackTitle}
            isPlaying={isPlaying}
            shouldAutoPlay={shouldAutoPlay}
            onTogglePlay={onTogglePlay}
            onPlay={onPlay}
            onPause={onPause}
            onEnded={onEnded}
            onPreviousTrack={onPreviousTrack}
            onNextTrack={onNextTrack}
            setPlayerControls={setPlayerControls}
          />
        )}
        {selectedArtist?.release && (
          <ReleaseShareWidget
            featuredArtists={displayableArtists}
            selectedArtist={selectedArtist}
            setSelectedArtist={setSelectedArtist}
          />
        )}
      </div>
    </MediaPlayer>
  );
};

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

  useEffect(() => {
    if (displayableArtists.length === 0) {
      setSelectedArtist(null);
      setCurrentFileId(null);
      return;
    }

    const selectedArtistStillAvailable = selectedArtist
      ? displayableArtists.some((artist) => artist.id === selectedArtist.id)
      : false;

    if (!selectedArtistStillAvailable) {
      setSelectedArtist(displayableArtists[0]);
      setCurrentFileId(null);
    }
  }, [displayableArtists, selectedArtist]);

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

  /** CDN URL for the current file's audio (signed CloudFront URL when configured). */
  const audioSrc = useMemo<string | null>(() => {
    if (!currentFile) return null;
    return resolveStreamUrl(currentFile);
  }, [currentFile]);

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

  // Toggle play/pause when the user re-selects the already-current artist.
  const toggleCurrentArtistPlayback = useCallback(() => {
    if (isPlaying) {
      playerControls?.pause();
    } else {
      playerControls?.play();
    }
  }, [isPlaying, playerControls]);

  // Stable across track-advance/playback re-renders (deps are only the values
  // it actually reads) so the memoized FeaturedArtistCarousel doesn't re-render
  // every time a track auto-advances.
  const handleSelectArtist = useCallback(
    (artist: FeaturedArtist, options?: { autoPlay?: boolean }) => {
      // If this is a click-initiated reselect of the current artist, toggle play/pause
      if (selectedArtist?.id === artist.id) {
        if (options?.autoPlay) {
          toggleCurrentArtistPlayback();
        }
        return;
      }

      setShouldAutoPlay(options?.autoPlay ?? false);
      setSelectedArtist(artist);
      // Reset to the featured track if set, otherwise the first file
      setCurrentFileId(
        resolveInitialFileId(artist.digitalFormat?.files ?? [], artist.featuredTrackNumber)
      );
    },
    [selectedArtist?.id, toggleCurrentArtistPlayback]
  );

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
      <div className="py-8 text-center text-zinc-500">
        <p>No featured artists available at this time.</p>
      </div>
    );
  }

  const showFileListDrawer = sortedFiles.length > 0;
  const currentTrackTitle = currentFile
    ? getTrackDisplayTitle(currentFile.title, currentFile.fileName)
    : '';

  return (
    <FeaturedArtistsPlayerBody
      displayableArtists={displayableArtists}
      selectedArtist={selectedArtist}
      setSelectedArtist={setSelectedArtist}
      sortedFiles={sortedFiles}
      currentFile={currentFile}
      audioSrc={audioSrc}
      currentTrackTitle={currentTrackTitle}
      showFileListDrawer={showFileListDrawer}
      isPlaying={isPlaying}
      shouldAutoPlay={shouldAutoPlay}
      onSelectArtist={handleSelectArtist}
      onFileSelect={handleFileSelect}
      onTogglePlay={handleTogglePlay}
      onPlay={handlePlay}
      onPause={handlePause}
      onEnded={handleTrackEnded}
      onPreviousTrack={handlePreviousTrack}
      onNextTrack={handleNextTrack}
      setPlayerControls={setPlayerControls}
    />
  );
};
