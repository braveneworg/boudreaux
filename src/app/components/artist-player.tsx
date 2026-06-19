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
  const selectedArtistRelease = releases.at(selectedReleaseIndex);
  const selectedRelease = selectedArtistRelease?.release;

  const files = useMemo(
    () =>
      selectedRelease?.digitalFormats.find((fmt) => fmt.formatType === 'MP3_320KBPS')?.files ?? [],
    [selectedRelease?.digitalFormats]
  );

  const currentFile = files.at(currentTrackIndex) ?? null;
  const hasFiles = files.length > 0;

  const audioSrc = useMemo<string | null>(() => {
    if (!currentFile) return null;
    return resolveStreamUrl(currentFile);
  }, [currentFile]);

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
      <div className="text-zinc-950-foreground flex items-center justify-center py-12">
        <p>No releases available for this artist.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Release selector — shown when 2+ releases. Selecting loads + streams. */}
      {releases.length >= 2 && (
        <ReleaseCombobox
          ariaLabel={`Select a release by ${artistName}`}
          selectedId={selectedRelease?.id ?? ''}
          releases={releases.map((ar: ArtistWithPublishedReleases['releases'][number]) => ({
            id: ar.release.id,
            title: ar.release.title,
            coverArtSrc: getReleaseCoverArt(ar.release)?.src ?? null,
          }))}
          onSelect={(id) => {
            const index = releases.findIndex(
              (ar: ArtistWithPublishedReleases['releases'][number]) => ar.release.id === id
            );
            if (index >= 0) {
              handleReleaseSelect(index);
            }
          }}
        />
      )}

      {/* Media player */}
      <MediaPlayer className="mb-2">
        <div className="mt-2 space-y-1">
          {/* Artist + release header */}
          {selectedRelease && <ReleaseShareWidget />}
          <div className="flex flex-col items-center">
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
                <NowPlayingHeading
                  artistName={artistName}
                  title={selectedRelease?.title ?? ''}
                  visibleHeading
                />
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
              downloadTrigger={
                <DeferredDownloadDialog
                  artistName={artistName}
                  releaseId={selectedRelease.id}
                  releaseTitle={selectedRelease.title ?? ''}
                >
                  <MediaActionLink icon={Download} label="Download" />
                </DeferredDownloadDialog>
              }
            />
          )}
        </div>
      </MediaPlayer>
    </div>
  );
};
