/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { Download } from 'lucide-react';

import { MediaPlayer } from '@/app/components/ui/audio/media-player';
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
import { useFeaturedPlayerStore } from './use-featured-player-store';

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
  currentFile: FeaturedArtistFormatFile | null;
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
  currentFile,
}: FeaturedArtistTrackRowProps) => {
  const selectFile = useFeaturedPlayerStore((state) => state.selectFile);
  const displayName = getFeaturedArtistDisplayName(selectedArtist) ?? '';
  const releaseTitle = release.title ?? '';
  return (
    <>
      <MediaPlayer.FormatFileListDrawer
        files={sortedFiles}
        currentFileId={currentFile?.id ?? null}
        onFileSelect={(fileId) => selectFile(fileId, true)}
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
  currentFile: FeaturedArtistFormatFile | null;
}

/**
 * Guards rendering of {@link FeaturedArtistTrackRow}: only shows the track row
 * when there are files (`show`) and the selected artist has a release.
 */
const FeaturedArtistTrackRowSlot = ({
  show,
  selectedArtist,
  sortedFiles,
  currentFile,
}: FeaturedArtistTrackRowSlotProps) => {
  if (!show || !selectedArtist?.release) return null;
  return (
    <FeaturedArtistTrackRow
      selectedArtist={selectedArtist}
      release={selectedArtist.release}
      sortedFiles={sortedFiles}
      currentFile={currentFile}
    />
  );
};

interface FeaturedArtistDetailsProps {
  selectedArtist: FeaturedArtist;
  sortedFiles: FeaturedArtistFormatFile[];
  currentFile: FeaturedArtistFormatFile | null;
  audioSrc: string | null;
  currentTrackTitle: string;
}

/**
 * Selected-artist detail stack: interactive cover art, the audio controls
 * (once a source resolves), and the scrolling info ticker. Each slot reserves a
 * stable min-height to avoid layout shift during lazy load.
 */
const FeaturedArtistDetails = ({
  selectedArtist,
  sortedFiles,
  currentFile,
  audioSrc,
  currentTrackTitle,
}: FeaturedArtistDetailsProps) => {
  const isPlaying = useFeaturedPlayerStore((state) => state.isPlaying);
  const shouldAutoPlay = useFeaturedPlayerStore((state) => state.shouldAutoPlay);
  const playerControls = useFeaturedPlayerStore((state) => state.playerControls);
  const setIsPlaying = useFeaturedPlayerStore((state) => state.setIsPlaying);
  const setPlayerControls = useFeaturedPlayerStore((state) => state.setPlayerControls);
  const { handleTrackEnded, handlePreviousTrack, handleNextTrack } = useTrackAdvance(
    sortedFiles,
    currentFile
  );

  const handlePlay = useCallback(() => setIsPlaying(true), [setIsPlaying]);
  const handlePause = useCallback(() => setIsPlaying(false), [setIsPlaying]);
  const handleTogglePlay = useCallback(() => playerControls?.toggle(), [playerControls]);

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
              onTogglePlay={handleTogglePlay}
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
              onPlay={handlePlay}
              onPause={handlePause}
              onEnded={handleTrackEnded}
              onPreviousTrack={handlePreviousTrack}
              onNextTrack={handleNextTrack}
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
  sortedFiles: FeaturedArtistFormatFile[];
  currentFile: FeaturedArtistFormatFile | null;
  audioSrc: string | null;
  currentTrackTitle: string;
  showFileListDrawer: boolean;
  onSelectArtist: (artist: FeaturedArtist, options?: { autoPlay?: boolean }) => void;
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
  sortedFiles,
  currentFile,
  audioSrc,
  currentTrackTitle,
  showFileListDrawer,
  onSelectArtist,
}: FeaturedArtistsPlayerBodyProps) => (
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
          currentFile={currentFile}
        />
      </div>

      {/* Selected Artist Details — cover art + controls + ticker */}
      {selectedArtist && (
        <FeaturedArtistDetails
          selectedArtist={selectedArtist}
          sortedFiles={sortedFiles}
          currentFile={currentFile}
          audioSrc={audioSrc}
          currentTrackTitle={currentTrackTitle}
        />
      )}
      {selectedArtist?.release && (
        <ReleaseShareWidget
          featuredArtists={displayableArtists}
          selectedArtist={selectedArtist}
          setSelectedArtist={(artist) => {
            if (artist) onSelectArtist(artist);
          }}
        />
      )}
    </div>
  </MediaPlayer>
);

interface FeaturedPlayerViewModel {
  selectedArtist: FeaturedArtist | null;
  sortedFiles: FeaturedArtistFormatFile[];
  currentFile: FeaturedArtistFormatFile | null;
  audioSrc: string | null;
  handleSelectArtist: (artist: FeaturedArtist, options?: { autoPlay?: boolean }) => void;
}

/**
 * Binds the featured player's store state to the server-provided artist list.
 * Selection is derived, not synced: a stored ID that left the list falls back
 * to the first displayable artist without writing to the store. Playback
 * flags and the imperative controls handle reset on unmount (Video.js
 * disposes with the component); the selection itself intentionally survives
 * so returning to the home page restores the last-selected artist.
 */
const useFeaturedPlayer = (displayableArtists: FeaturedArtist[]): FeaturedPlayerViewModel => {
  const selectedArtistId = useFeaturedPlayerStore((state) => state.selectedArtistId);
  const currentFileId = useFeaturedPlayerStore((state) => state.currentFileId);
  const isPlaying = useFeaturedPlayerStore((state) => state.isPlaying);
  const playerControls = useFeaturedPlayerStore((state) => state.playerControls);
  const selectArtist = useFeaturedPlayerStore((state) => state.selectArtist);
  const resetPlayback = useFeaturedPlayerStore((state) => state.resetPlayback);

  useEffect(() => resetPlayback, [resetPlayback]);

  const selectedArtist = useMemo<FeaturedArtist | null>(() => {
    if (displayableArtists.length === 0) return null;
    return (
      displayableArtists.find((artist) => artist.id === selectedArtistId) ?? displayableArtists[0]
    );
  }, [displayableArtists, selectedArtistId]);

  const sortedFiles = useMemo<FeaturedArtistFormatFile[]>(() => {
    const files = selectedArtist?.digitalFormat?.files;
    if (!files || files.length === 0) return [];
    return sortFilesByTrackNumber(files);
  }, [selectedArtist?.digitalFormat?.files]);

  const currentFile = useMemo<FeaturedArtistFormatFile | null>(() => {
    if (currentFileId) {
      const inList = sortedFiles.find((file) => file.id === currentFileId);
      if (inList) return inList;
    }
    if (selectedArtist?.featuredTrackNumber != null) {
      const featured = sortedFiles.find(
        (file) => file.trackNumber === selectedArtist.featuredTrackNumber
      );
      if (featured) return featured;
    }
    return sortedFiles[0] ?? null;
  }, [currentFileId, sortedFiles, selectedArtist?.featuredTrackNumber]);

  const audioSrc = useMemo<string | null>(
    () => (currentFile ? resolveStreamUrl(currentFile) : null),
    [currentFile]
  );

  const toggleCurrentArtistPlayback = useCallback(() => {
    if (isPlaying) {
      playerControls?.pause();
    } else {
      playerControls?.play();
    }
  }, [isPlaying, playerControls]);

  const handleSelectArtist = useCallback(
    (artist: FeaturedArtist, options?: { autoPlay?: boolean }) => {
      if (selectedArtist?.id === artist.id) {
        if (options?.autoPlay) toggleCurrentArtistPlayback();
        return;
      }
      selectArtist(
        artist.id,
        resolveInitialFileId(artist.digitalFormat?.files ?? [], artist.featuredTrackNumber),
        options?.autoPlay ?? false
      );
    },
    [selectedArtist?.id, toggleCurrentArtistPlayback, selectArtist]
  );

  return { selectedArtist, sortedFiles, currentFile, audioSrc, handleSelectArtist };
};

/** Track-advance handlers built on the store's selectFile — auto-advance on
 *  ended, and previous/next preserving the was-playing intent. */
const useTrackAdvance = (
  sortedFiles: FeaturedArtistFormatFile[],
  currentFile: FeaturedArtistFormatFile | null
): {
  handleTrackEnded: () => void;
  handlePreviousTrack: (wasPlaying: boolean) => void;
  handleNextTrack: (wasPlaying: boolean) => void;
} => {
  const selectFile = useFeaturedPlayerStore((state) => state.selectFile);

  const advance = useCallback(
    (direction: 1 | -1, autoPlay: boolean) => {
      /* v8 ignore next -- defensive guard: handlers only fire while a track is loaded */
      if (!currentFile || sortedFiles.length === 0) return;
      const currentIndex = sortedFiles.findIndex((file) => file.id === currentFile.id);
      if (currentIndex === -1) return;
      const nextFile = sortedFiles[currentIndex + direction];
      if (nextFile) selectFile(nextFile.id, autoPlay);
    },
    [currentFile, sortedFiles, selectFile]
  );

  return {
    handleTrackEnded: useCallback(() => advance(1, true), [advance]),
    handlePreviousTrack: useCallback((wasPlaying: boolean) => advance(-1, wasPlaying), [advance]),
    handleNextTrack: useCallback((wasPlaying: boolean) => advance(1, wasPlaying), [advance]),
  };
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

  const { selectedArtist, sortedFiles, currentFile, audioSrc, handleSelectArtist } =
    useFeaturedPlayer(displayableArtists);

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
      sortedFiles={sortedFiles}
      currentFile={currentFile}
      audioSrc={audioSrc}
      currentTrackTitle={currentTrackTitle}
      showFileListDrawer={showFileListDrawer}
      onSelectArtist={handleSelectArtist}
    />
  );
};
