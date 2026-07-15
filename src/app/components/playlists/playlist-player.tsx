/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { useEffect, useMemo, useState, type ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { useTrackNavigation } from '@/components/use-track-navigation';
import type { PlaylistItemPayload } from '@/lib/types/domain/playlist';
import { cn } from '@/lib/utils';
import { resolveStreamUrl } from '@/lib/utils/cdn-url';
import { formatDuration } from '@/lib/utils/format-duration';
import { MediaPlayer } from '@/ui/audio/media-player';
import type { MediaPlayerControls } from '@/ui/audio/media-player';
import { LazyVideoSurface } from '@/ui/video/lazy-video-surface';

import { PlaylistCoverTiles } from './playlist-cover-tiles';

interface PlaylistPlayerProps {
  /** Playlist items; rendered in `sortOrder` regardless of input order. */
  items: PlaylistItemPayload[];
  /** Playlist title — alt text for the fallback mosaic + queue ARIA label. */
  title: string;
}

/** An item the player can actually stream: available with a resolvable URL. */
const isPlayableItem = (item: PlaylistItemPayload): boolean =>
  item.available && resolveStreamUrl(item) !== null;

interface PlaylistPlayerArtProps {
  coverArt: string | null;
  fallbackImages: string[];
  coverAlt: string;
  tilesAlt: string;
  isPlaying: boolean;
  onTogglePlay: () => void;
}

/** Cover art with play/pause toggle; playlist tiles stand in when the item has no art. */
const PlaylistPlayerArt = ({
  coverArt,
  fallbackImages,
  coverAlt,
  tilesAlt,
  isPlaying,
  onTogglePlay,
}: PlaylistPlayerArtProps): ReactElement =>
  coverArt ? (
    <MediaPlayer.InteractiveCoverArt
      src={coverArt}
      alt={coverAlt}
      isPlaying={isPlaying}
      onTogglePlay={onTogglePlay}
    />
  ) : (
    <button
      type="button"
      onClick={onTogglePlay}
      aria-label={isPlaying ? 'Pause' : 'Play'}
      className="block w-full cursor-pointer focus:outline-none"
    >
      <PlaylistCoverTiles images={fallbackImages} alt={tilesAlt} size="lg" />
    </button>
  );

interface PlaylistQueueRowProps {
  item: PlaylistItemPayload;
  isCurrent: boolean;
  onSelect: (itemId: string) => void;
}

/** One queue row: title (+video badge), artist, duration; disabled when unplayable. */
const PlaylistQueueRow = ({ item, isCurrent, onSelect }: PlaylistQueueRowProps): ReactElement => {
  const playable = isPlayableItem(item);
  const mutedClass = isCurrent ? 'text-zinc-300' : 'text-zinc-500';

  return (
    <li>
      <button
        type="button"
        disabled={!playable}
        aria-label={`Play ${item.title}`}
        onClick={() => onSelect(item.id)}
        className={cn(
          'flex w-full items-center gap-3 p-3 text-left transition-colors',
          isCurrent ? 'bg-zinc-800 text-zinc-50' : 'hover:bg-zinc-50',
          !playable && 'cursor-not-allowed opacity-50'
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-medium">{item.title}</span>
          {item.itemType === 'video' && <Badge variant="secondary">video</Badge>}
          {!playable && <span className={cn('shrink-0 text-xs', mutedClass)}>unavailable</span>}
        </span>
        {item.artistName && (
          <span className={cn('truncate text-xs', mutedClass)}>{item.artistName}</span>
        )}
        <span className={cn('shrink-0 text-xs', mutedClass)}>{formatDuration(item.duration)}</span>
      </button>
    </li>
  );
};

interface PlaylistTrackSurfaceProps {
  item: PlaylistItemPayload;
  src: string;
  fallbackImages: string[];
  playlistTitle: string;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onPreviousTrack: (wasPlaying: boolean) => void;
  onNextTrack: (wasPlaying: boolean) => void;
  onTogglePlay: () => void;
  setPlayerControls: (controls: MediaPlayerControls | null) => void;
}

/** Audio stage: art + transport. Keyed per item id by the stage, so every mount is fresh. */
const PlaylistTrackSurface = ({
  item,
  src,
  fallbackImages,
  playlistTitle,
  isPlaying,
  onPlay,
  onPause,
  onEnded,
  onPreviousTrack,
  onNextTrack,
  onTogglePlay,
  setPlayerControls,
}: PlaylistTrackSurfaceProps): ReactElement => (
  <>
    <PlaylistPlayerArt
      coverArt={item.coverArt}
      fallbackImages={fallbackImages}
      coverAlt={`${item.title} cover art`}
      tilesAlt={playlistTitle}
      isPlaying={isPlaying}
      onTogglePlay={onTogglePlay}
    />
    <div className="w-full bg-zinc-900">
      <MediaPlayer.Controls
        audioSrc={src}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
        onPreviousTrack={onPreviousTrack}
        onNextTrack={onNextTrack}
        controlsRef={setPlayerControls}
      />
    </div>
  </>
);

interface PlaylistPlayerStageProps extends Omit<PlaylistTrackSurfaceProps, 'src'> {
  src: string;
  onVideoEnded: () => void;
}

/**
 * The keyed media stage: exactly ONE surface mounts at a time (video.js
 * lifecycle risk — spec "keyed subtrees, no forceMount"). Track↔video swaps
 * change the key, so the outgoing surface always disposes before the next
 * one initializes.
 */
const PlaylistPlayerStage = ({
  onVideoEnded,
  ...surface
}: PlaylistPlayerStageProps): ReactElement =>
  surface.item.itemType === 'video' ? (
    <LazyVideoSurface
      key={`video-${surface.item.id}`}
      title={surface.item.title}
      src={surface.src}
      posterUrl={surface.item.posterUrl}
      onEnded={onVideoEnded}
    />
  ) : (
    <PlaylistTrackSurface key={`track-${surface.item.id}`} {...surface} />
  );

/**
 * Light playlist player composed from MediaPlayer leaves. Tracks render
 * cover art + the audio transport; videos render the inline video surface.
 * Navigation runs over the playable subset only, so unavailable items are
 * skipped on ended/next while still shown (disabled) in the queue below.
 */
export const PlaylistPlayer = ({ items, title }: PlaylistPlayerProps): ReactElement => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerControls, setPlayerControls] = useState<MediaPlayerControls | null>(null);

  const sortedItems = useMemo(() => [...items].sort((a, b) => a.sortOrder - b.sortOrder), [items]);
  const playableItems = useMemo(() => sortedItems.filter(isPlayableItem), [sortedItems]);
  const fallbackImages = useMemo(
    () => [
      ...new Set(
        sortedItems.map((item) => item.coverArt).filter((src): src is string => src !== null)
      ),
    ],
    [sortedItems]
  );

  const {
    currentIndex,
    shouldAutoPlay,
    handleFileSelect,
    handleTrackEnded,
    handlePreviousTrack,
    handleNextTrack,
  } = useTrackNavigation(playableItems, false);

  const currentItem = playableItems.at(currentIndex) ?? null;
  const currentSrc = currentItem ? resolveStreamUrl(currentItem) : null;

  // The keyed stage swaps out on item change — reset the play flag with it.
  useEffect(() => {
    setIsPlaying(false);
  }, [currentItem?.id]);

  // A freshly keyed Controls instance never autoplays its initial source
  // (verified in media-player-controls.tsx) — start it explicitly once the
  // new instance reports ready, exactly like the release player's trick.
  useEffect(() => {
    if (shouldAutoPlay && playerControls) playerControls.play();
  }, [playerControls, shouldAutoPlay]);

  if (!currentItem || !currentSrc) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">No playable items in this playlist.</p>
    );
  }

  return (
    <MediaPlayer>
      <div className="w-full border-2 border-black">
        <PlaylistPlayerStage
          item={currentItem}
          src={currentSrc}
          fallbackImages={fallbackImages}
          playlistTitle={title}
          isPlaying={isPlaying}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={handleTrackEnded}
          onPreviousTrack={handlePreviousTrack}
          onNextTrack={handleNextTrack}
          onTogglePlay={() => playerControls?.toggle()}
          setPlayerControls={setPlayerControls}
          onVideoEnded={handleTrackEnded}
        />
        <MediaPlayer.InfoTickerTape
          trackTitle={currentItem.title}
          artistName={currentItem.artistName}
          isPlaying={isPlaying}
        />
        <ul
          aria-label={`${title} queue`}
          className="max-h-64 overflow-y-auto border-t-2 border-black"
        >
          {sortedItems.map((item) => (
            <PlaylistQueueRow
              key={item.id}
              item={item}
              isCurrent={item.id === currentItem.id}
              onSelect={handleFileSelect}
            />
          ))}
        </ul>
      </div>
    </MediaPlayer>
  );
};
