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

import { Download } from 'lucide-react';

import { MediaActionLink } from '@/app/components/media-action-link';
import { ReleaseCombobox } from '@/app/components/release-combobox';
import { MediaPlayer } from '@/app/components/ui/audio/media-player';
import type { MediaPlayerControls } from '@/app/components/ui/audio/media-player';
import type { ArtistWithPublishedReleases } from '@/lib/types/media-models';
import { resolveStreamUrl } from '@/lib/utils/cdn-url';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import { getTrackDisplayTitle } from '@/lib/utils/get-track-display-title';
import { getReleaseCoverArt } from '@/lib/utils/release-helpers';

import { DeferredDownloadDialog } from './deferred-download-dialog';
import { NowPlayingHeading } from './now-playing-heading';
import { ReleaseShareWidget } from './release-share-widget';
import { useTrackNavigation } from './use-track-navigation';

interface ArtistPlayerProps {
  /** Artist with published releases and tracks */
  artist: ArtistWithPublishedReleases;
  /** Optional release ID to initially select (e.g. from search) */
  initialReleaseId?: string;
}

type ArtistRelease = ArtistWithPublishedReleases['releases'][number];

/**
 * Resolve the initially-selected release index for an optional `initialReleaseId`
 * (e.g. arriving from search). Falls back to the first release when there is no
 * id or no match.
 */
const computeInitialReleaseIndex = (
  releases: ArtistRelease[],
  initialReleaseId?: string
): number => {
  if (!initialReleaseId) return 0;
  return Math.max(
    0,
    releases.findIndex((ar: ArtistRelease) => ar.release.id === initialReleaseId)
  );
};

/** Resolved cover-art `src`/`alt` for the artist player's selected release. */
interface ResolvedCoverArt {
  src: string;
  alt: string;
}

/**
 * Resolve cover-art `src`/`alt` for the selected release, falling back to an
 * empty src and an artist-name-based alt when no cover art is available.
 */
const resolveArtistCoverArt = (
  selectedRelease: ArtistRelease['release'] | undefined,
  artistName: string
): ResolvedCoverArt => {
  const coverArt = selectedRelease ? getReleaseCoverArt(selectedRelease) : null;
  return {
    src: coverArt?.src ?? '',
    alt: coverArt?.alt ?? `${artistName} cover art`,
  };
};

interface ArtistReleaseSelectorProps {
  artistName: string;
  releases: ArtistRelease[];
  selectedReleaseId: string;
  /** Invoked with the index of the chosen release within `releases`. */
  onReleaseSelect: (index: number) => void;
}

/**
 * Release picker shown when an artist has 2+ playable releases. Selecting an
 * entry resolves it back to its index and forwards to {@link ArtistPlayer}'s
 * `handleReleaseSelect` (which loads + streams the first track).
 */
const ArtistReleaseSelector = ({
  artistName,
  releases,
  selectedReleaseId,
  onReleaseSelect,
}: ArtistReleaseSelectorProps) => (
  <ReleaseCombobox
    ariaLabel={`Select a release by ${artistName}`}
    selectedId={selectedReleaseId}
    releases={releases.map((ar: ArtistRelease) => ({
      id: ar.release.id,
      title: ar.release.title,
      coverArtSrc: getReleaseCoverArt(ar.release)?.src ?? null,
    }))}
    onSelect={(id) => {
      const index = releases.findIndex((ar: ArtistRelease) => ar.release.id === id);
      if (index >= 0) {
        onReleaseSelect(index);
      }
    }}
  />
);

interface ArtistPlayerStageProps {
  artist: ArtistWithPublishedReleases;
  selectedRelease: ArtistRelease['release'];
  coverArtSrc: string;
  coverArtAlt: string;
  artistName: string;
  isPlaying: boolean;
  shouldAutoPlay: boolean;
  currentFile: ArtistRelease['release']['digitalFormats'][number]['files'][number] | null;
  audioSrc: string | null;
  hasFiles: boolean;
  onTogglePlay: () => void;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onPreviousTrack: (wasPlaying: boolean) => void;
  onNextTrack: (wasPlaying: boolean) => void;
  setPlayerControls: (controls: MediaPlayerControls | null) => void;
}

/**
 * The visual "stage" for the artist player: interactive cover art with the
 * now-playing heading, plus the audio controls + info ticker when a playable
 * track is available (otherwise an empty-state message). The black border +
 * zine shadow frame cover art, controls, and ticker as one unit.
 */
const ArtistPlayerStage = ({
  artist,
  selectedRelease,
  coverArtSrc,
  coverArtAlt,
  artistName,
  isPlaying,
  shouldAutoPlay,
  currentFile,
  audioSrc,
  hasFiles,
  onTogglePlay,
  onPlay,
  onPause,
  onEnded,
  onPreviousTrack,
  onNextTrack,
  setPlayerControls,
}: ArtistPlayerStageProps) => (
  <div className="shadow-zine mx-auto w-full max-w-xl border-2 border-black md:max-w-3xl lg:max-w-4xl">
    <div className="relative">
      <MediaPlayer.InteractiveCoverArt
        src={coverArtSrc}
        alt={coverArtAlt}
        isPlaying={isPlaying}
        onTogglePlay={onTogglePlay}
        priority
      />
      <NowPlayingHeading
        artistName={artistName}
        title={selectedRelease.title ?? ''}
        visibleHeading
      />
    </div>

    {hasFiles && currentFile && audioSrc ? (
      <>
        <div className="w-full bg-zinc-900">
          <MediaPlayer.Controls
            key={`controls-${selectedRelease.id}`}
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
);

type ReleaseFile = ArtistRelease['release']['digitalFormats'][number]['files'][number];

interface ArtistPlayerBodyProps {
  artist: ArtistWithPublishedReleases;
  releases: ArtistRelease[];
  selectedRelease: ArtistRelease['release'] | undefined;
  artistName: string;
  coverArtSrc: string;
  coverArtAlt: string;
  isPlaying: boolean;
  shouldAutoPlay: boolean;
  currentFile: ReleaseFile | null;
  audioSrc: string | null;
  hasFiles: boolean;
  files: ReleaseFile[];
  onReleaseSelect: (index: number) => void;
  onTogglePlay: () => void;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onPreviousTrack: (wasPlaying: boolean) => void;
  onNextTrack: (wasPlaying: boolean) => void;
  onFileSelect: (fileId: string) => void;
  setPlayerControls: (controls: MediaPlayerControls | null) => void;
}

interface ArtistFileListDrawerProps {
  files: ReleaseFile[];
  currentFile: ReleaseFile;
  selectedRelease: ArtistRelease['release'];
  artistName: string;
  onFileSelect: (fileId: string) => void;
}

/**
 * Track-list drawer for the artist player, paired with a download trigger that
 * opens the {@link DeferredDownloadDialog} for the selected release.
 */
const ArtistFileListDrawer = ({
  files,
  currentFile,
  selectedRelease,
  artistName,
  onFileSelect,
}: ArtistFileListDrawerProps) => {
  const releaseTitle = selectedRelease.title ?? '';
  return (
    <MediaPlayer.FormatFileListDrawer
      files={files}
      currentFileId={currentFile.id}
      onFileSelect={onFileSelect}
      artistName={artistName}
      releaseTitle={releaseTitle}
      downloadTrigger={
        <DeferredDownloadDialog
          artistName={artistName}
          releaseId={selectedRelease.id}
          releaseTitle={releaseTitle}
        >
          <MediaActionLink icon={Download} label="Download" />
        </DeferredDownloadDialog>
      }
    />
  );
};

/**
 * Renders the artist player's interactive body: the release selector (2+
 * releases), the now-playing stage, and the track-list drawer. Split out of
 * {@link ArtistPlayer} so the parent stays focused on state derivation.
 */
const ArtistPlayerBody = ({
  artist,
  releases,
  selectedRelease,
  artistName,
  coverArtSrc,
  coverArtAlt,
  isPlaying,
  shouldAutoPlay,
  currentFile,
  audioSrc,
  hasFiles,
  files,
  onReleaseSelect,
  onTogglePlay,
  onPlay,
  onPause,
  onEnded,
  onPreviousTrack,
  onNextTrack,
  onFileSelect,
  setPlayerControls,
}: ArtistPlayerBodyProps) => (
  <div className="flex flex-col gap-4">
    {/* Release selector — shown when 2+ releases. Selecting loads + streams. */}
    {releases.length >= 2 && (
      <ArtistReleaseSelector
        artistName={artistName}
        releases={releases}
        selectedReleaseId={selectedRelease?.id ?? ''}
        onReleaseSelect={onReleaseSelect}
      />
    )}

    {/* Media player */}
    <MediaPlayer className="mb-2">
      <div className="mt-2 space-y-1">
        {/* Artist + release header */}
        {selectedRelease && <ReleaseShareWidget />}
        <div className="flex flex-col items-center">
          {selectedRelease && (
            <ArtistPlayerStage
              artist={artist}
              selectedRelease={selectedRelease}
              coverArtSrc={coverArtSrc}
              coverArtAlt={coverArtAlt}
              artistName={artistName}
              isPlaying={isPlaying}
              shouldAutoPlay={shouldAutoPlay}
              currentFile={currentFile}
              audioSrc={audioSrc}
              hasFiles={hasFiles}
              onTogglePlay={onTogglePlay}
              onPlay={onPlay}
              onPause={onPause}
              onEnded={onEnded}
              onPreviousTrack={onPreviousTrack}
              onNextTrack={onNextTrack}
              setPlayerControls={setPlayerControls}
            />
          )}
        </div>

        {hasFiles && currentFile && selectedRelease && (
          <ArtistFileListDrawer
            files={files}
            currentFile={currentFile}
            selectedRelease={selectedRelease}
            artistName={artistName}
            onFileSelect={onFileSelect}
          />
        )}
      </div>
    </MediaPlayer>
  </div>
);

/**
 * Artist media player. Composes a release thumbnail carousel with
 * MediaPlayer sub-components for audio playback.
 */
export const ArtistPlayer = ({ artist, initialReleaseId }: ArtistPlayerProps) => {
  const releases = artist.releases;

  const initialIndex = computeInitialReleaseIndex(releases, initialReleaseId);

  const [selectedReleaseIndex, setSelectedReleaseIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerControls, setPlayerControls] = useState<MediaPlayerControls | null>(null);
  const selectedArtistRelease = releases.at(selectedReleaseIndex);
  const selectedRelease = selectedArtistRelease?.release;

  const files = useMemo(
    () =>
      selectedRelease?.digitalFormats.find((fmt) => fmt.formatType === 'MP3_320KBPS')?.files ?? [],
    [selectedRelease?.digitalFormats]
  );

  const {
    currentIndex: currentTrackIndex,
    setCurrentIndex: setCurrentTrackIndex,
    shouldAutoPlay,
    setShouldAutoPlay,
    handleFileSelect,
    handleTrackEnded,
    handlePreviousTrack,
    handleNextTrack,
  } = useTrackNavigation(files, !!initialReleaseId);

  const currentFile = files.at(currentTrackIndex) ?? null;
  const hasFiles = files.length > 0;

  const audioSrc = useMemo<string | null>(() => {
    if (!currentFile) return null;
    return resolveStreamUrl(currentFile);
  }, [currentFile]);

  const artistName = getArtistDisplayName(artist);

  const { src: coverArtSrc, alt: coverArtAlt } = resolveArtistCoverArt(selectedRelease, artistName);

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
    [selectedReleaseIndex, playerControls, setCurrentTrackIndex, setShouldAutoPlay]
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

  if (releases.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-950">
        <p>No releases available for this artist.</p>
      </div>
    );
  }

  return (
    <ArtistPlayerBody
      artist={artist}
      releases={releases}
      selectedRelease={selectedRelease}
      artistName={artistName}
      coverArtSrc={coverArtSrc}
      coverArtAlt={coverArtAlt}
      isPlaying={isPlaying}
      shouldAutoPlay={shouldAutoPlay}
      currentFile={currentFile}
      audioSrc={audioSrc}
      hasFiles={hasFiles}
      files={files}
      onReleaseSelect={handleReleaseSelect}
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
