/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Image from 'next/image';

import { ChevronDown, ChevronUp, EllipsisVertical, Eye, Pause, Play, Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import type { Artist, FeaturedArtist, Release } from '@/lib/types/media-models';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import { getFeaturedArtistCoverArt } from '@/lib/utils/get-featured-artist-cover-art';
import { getFeaturedArtistDisplayName } from '@/lib/utils/get-featured-artist-display-name';
import { getTrackDisplayTitle } from '@/lib/utils/get-track-display-title';
import { cn } from '@/lib/utils/tailwind-utils';

import { LazyControls } from './lazy-controls';

/**
 * A carousel component that displays a grid of artist images.
 *
 * @param props - The component props
 * @param props.artists - Array of artist objects to display in the carousel
 * @param props.numberUp - Number of artists to display in the carousel (default: 4)
 *
 * @returns A horizontal carousel component with artist cover art images
 *
 * @remarks
 * - Displays the most recent release cover art or specified cover art for each artist
 * - Automatically slices the artists array to match the numberUp parameter
 * - Includes previous/next navigation controls
 * - You may need to experiment with gap, padding, and other styles for different numberUp values
 *
 * @example
 * ```tsx
 * <MediaPlayer>
 *   <MediaPlayer.Search />
 *   <MediaPlayer.CoverArtCarousel artists={artistList} numberUp={4} />
 *   <MediaPlayer.CoverArtView />
 *   <MediaPlayer.TickerTape />
 *   <MediaPlayer.Controls />
 * </MediaPlayer>
 * ```
 */
const CoverArtCarousel = ({ artists, numberUp = 4 }: { artists: Artist[]; numberUp: number }) => {
  // Note: you may need to experiment with gap, padding, and other styles to make sure it looks good
  // with different numbers of items per view.
  const numberUpSliced = artists.slice(0, numberUp);

  return (
    <Carousel aria-label="Featured Artists" orientation="horizontal">
      <div className="flex items-center gap-2">
        <CarouselPrevious className="relative top-auto left-0 shrink-0 translate-y-0" />
        <CarouselContent className="flex justify-center gap-2">
          {numberUpSliced.map((artist) => {
            const latestRelease = artist.releases.sort(
              (a: Artist['releases'][number], b: Artist['releases'][number]) =>
                b.release.releasedOn.getTime() - a.release.releasedOn.getTime()
            )[0];
            const latestCoverArt = latestRelease?.release.coverArt;

            return (
              <CarouselItem key={artist.id}>
                <Image
                  className="border-radius-[0.5rem]"
                  src={latestCoverArt}
                  alt={artist.displayName ?? `${artist.firstName} ${artist.surname}`}
                  width={144}
                  height={144}
                  sizes="144px"
                />
              </CarouselItem>
            );
          })}
        </CarouselContent>
        <CarouselNext className="relative top-auto right-auto shrink-0 translate-y-0" />
      </div>
    </Carousel>
  );
};

/**
 * A carousel component that displays featured artists with their cover art.
 *
 * @param props - The component props
 * @param props.featuredArtists - Array of FeaturedArtist objects to display in the carousel
 * @param props.onSelect - Optional callback function when a featured artist is selected
 *
 * @returns A horizontal carousel component with featured artist cover art images
 *
 * @remarks
 * - Displays the cover art for each featured artist (uses coverArt, release coverArt, or placeholder)
 * - Includes previous/next navigation controls
 * - Shows display name on hover
 * - Sorted by position field
 *
 * @example
 * ```tsx
 * <MediaPlayer>
 *   <MediaPlayer.FeaturedArtistCarousel
 *     featuredArtists={featuredArtists}
 *     onSelect={(artist) => console.log(artist)}
 *   />
 * </MediaPlayer>
 * ```
 */
const FeaturedArtistCarousel = ({
  featuredArtists,
  selectedArtistId,
  onSelect,
}: {
  featuredArtists: FeaturedArtist[];
  selectedArtistId?: string;
  onSelect?: (featuredArtist: FeaturedArtist, options?: { autoPlay?: boolean }) => void;
}) => {
  // Sort by position (lower numbers first)
  const sortedArtists = useMemo(
    () => [...featuredArtists].sort((a, b) => a.position - b.position),
    [featuredArtists]
  );
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const clickInitiatedRef = useRef(false);

  // Index of the externally-selected artist. The carousel must always center
  // this slide so the visible center matches the playing cover art.
  const selectedIndex = useMemo(() => {
    if (!selectedArtistId) return 0;
    const idx = sortedArtists.findIndex((a) => a.id === selectedArtistId);
    return idx < 0 ? 0 : idx;
  }, [sortedArtists, selectedArtistId]);

  const handleSelect = (featured: FeaturedArtist, index: number) => {
    if (!carouselApi) {
      onSelect?.(featured, { autoPlay: true });
      return;
    }

    clickInitiatedRef.current = true;
    carouselApi.scrollTo(index);
    // If already on this slide, settle won't fire — call onSelect directly
    if (carouselApi.selectedScrollSnap() === index) {
      onSelect?.(featured, { autoPlay: true });
      clickInitiatedRef.current = false;
    }
  };

  /** Sync player state when the carousel settles on a new slide */
  const handleSettle = useCallback(() => {
    if (!carouselApi) return;
    const index = carouselApi.selectedScrollSnap();
    const artist = sortedArtists[index];
    if (!artist) return;
    const autoPlay = clickInitiatedRef.current;
    clickInitiatedRef.current = false;
    onSelect?.(artist, { autoPlay });
  }, [carouselApi, sortedArtists, onSelect]);

  useEffect(() => {
    if (!carouselApi) return;
    carouselApi.on('settle', handleSettle);
    return () => {
      carouselApi.off('settle', handleSettle);
    };
  }, [carouselApi, handleSettle]);

  // Keep the carousel centered on the externally-selected artist. Runs on
  // mount once the API is ready, and on any change to the selected id.
  useEffect(() => {
    if (!carouselApi) return;
    if (carouselApi.selectedScrollSnap() === selectedIndex) return;
    carouselApi.scrollTo(selectedIndex);
  }, [carouselApi, selectedIndex]);

  return (
    <Carousel
      aria-label="Featured Artists"
      orientation="horizontal"
      className="mb-0 w-full"
      opts={{ loop: true, align: 'center' }}
      setApi={setCarouselApi}
    >
      <div className="flex items-center">
        <CarouselPrevious className="relative top-auto left-0 shrink-0 translate-y-0" />
        <CarouselContent className="-ml-2">
          {sortedArtists.map((featured, index) => {
            const coverArt = getFeaturedArtistCoverArt(featured);
            const displayName = getFeaturedArtistDisplayName(featured);
            const imageError = failedImages.has(featured.id);

            return (
              <CarouselItem
                key={featured.id}
                className="shrink-0 basis-1/3 pt-1 pb-1 pl-2 sm:basis-1/5 lg:basis-[calc(100%/7)]"
              >
                <button
                  type="button"
                  onClick={() => handleSelect(featured, index)}
                  className="group focus:ring-primary relative aspect-square w-full rounded-lg focus:ring-2 focus:ring-offset-2 focus:outline-none"
                  aria-label={`Select ${displayName}`}
                >
                  <div className="absolute inset-0 overflow-hidden rounded-lg">
                    {coverArt && !imageError ? (
                      <Image
                        src={coverArt}
                        alt={displayName ?? ''}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                        sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 14vw"
                        onError={() => {
                          setFailedImages((prev) => new Set(prev).add(featured.id));
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-zinc-200">
                        <span className="px-1 text-center text-xs text-zinc-950">
                          {displayName}
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-end justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                      <span className="max-w-full truncate px-1 pb-2 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                        {displayName}
                      </span>
                    </div>
                  </div>
                </button>
              </CarouselItem>
            );
          })}
        </CarouselContent>
        <CarouselNext className="relative top-auto right-auto shrink-0 translate-y-0" />
      </div>
    </Carousel>
  );
};

/**
 * A view that displays the cover art for a given release and artist.
 * @param artistRelease - An object containing a release and its associated artist
 * @param width - The width of the cover art image (default: 380)
 * @param height - The height of the cover art image (default: 380)
 * @returns a cover art view component
 * @remarks
 * - Displays the cover art image for the given release and artist
 * - Accepts optional width and height parameters to customize the image size
 */
const CoverArtView = ({
  artistRelease,
  width = 380,
  height = 380,
}: {
  artistRelease: { release: Release; artist: Artist };
  width?: number;
  height?: number;
}) => {
  const { release, artist } = artistRelease;

  return (
    <Image
      src={release.coverArt}
      alt={`${release.title} by ${getArtistDisplayName(artist)}`}
      width={width}
      height={height}
      className="aspect-square w-full rounded-lg object-cover"
    />
  );
};

/**
 * Props interface for the InteractiveCoverArt component.
 *
 * @property src - The source URL for the cover art image
 * @property alt - Alt text for the image
 * @property isPlaying - Whether the audio is currently playing
 * @property onTogglePlay - Callback function to toggle play/pause state
 * @property className - Optional CSS class names to apply to the container
 */
interface InteractiveCoverArtProps {
  src: string;
  alt: string;
  isPlaying: boolean;
  onTogglePlay: () => void;
  className?: string;
  priority?: boolean;
}

/**
 * InteractiveCoverArt component displays cover art with a play/pause overlay.
 *
 * @param props - The component props
 * @param props.src - The source URL for the cover art image
 * @param props.alt - Alt text for the image
 * @param props.isPlaying - Whether the audio is currently playing
 * @param props.onTogglePlay - Callback function to toggle play/pause state
 * @param props.className - Optional CSS class names to apply to the container
 *
 * @returns A cover art image with an interactive overlay for play/pause control
 *
 * @remarks
 * - Shows a play icon overlay when audio is not playing
 * - Shows a pause icon overlay briefly when user clicks to pause (for visual feedback)
 * - Never shows any overlay while audio is actively playing
 * - The entire cover art area is clickable to toggle playback
 *
 * @example
 * ```tsx
 * <MediaPlayer.InteractiveCoverArt
 *   src="/path/to/cover.jpg"
 *   alt="Album Name by Artist"
 *   isPlaying={isPlaying}
 *   onTogglePlay={handleTogglePlay}
 * />
 * ```
 */
const InteractiveCoverArt = ({
  src,
  alt,
  isPlaying,
  onTogglePlay,
  className,
  priority,
}: InteractiveCoverArtProps) => {
  const [showPauseOverlay, setShowPauseOverlay] = useState(false);
  const [imageError, setImageError] = useState(false);

  const handleClick = () => {
    if (isPlaying) {
      // Show pause overlay briefly when pausing
      setShowPauseOverlay(true);
      setTimeout(() => {
        setShowPauseOverlay(false);
      }, 800);
    }
    onTogglePlay();
  };

  // Determine which overlay to show:
  // - Show pause icon briefly after clicking to pause
  // - Show play icon when not playing (and not showing pause overlay)
  // - Show nothing when playing
  const showOverlay = !isPlaying || showPauseOverlay;
  const OverlayIcon = showPauseOverlay ? Pause : Play;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`group relative aspect-square w-full cursor-pointer overflow-hidden rounded-t-lg focus:outline-none ${className ?? ''}`}
      aria-label={isPlaying ? 'Pause' : 'Play'}
    >
      {imageError ? (
        <div className="flex h-full w-full items-center justify-center bg-zinc-200">
          <Play className="h-12 w-12 text-zinc-400" />
        </div>
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          className="object-cover"
          // Container is `w-full max-w-xl` (36rem = 576px). On mobile the slot
          // is viewport-wide; on sm+ it's capped at 576px. Telling the browser
          // this lets it pick w640 on desktop instead of w1080/w1200.
          sizes="(max-width: 640px) 100vw, 576px"
          priority={priority}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          onError={() => setImageError(true)}
        />
      )}
      {/* Overlay - visible when not playing or briefly when pausing */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
          showOverlay ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        {/* Nearly transparent background */}
        <div className="absolute inset-0 bg-black/10" />
        {/* Icon container */}
        <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
          <OverlayIcon className="h-8 w-8 text-white/30 drop-shadow-md" />
        </div>
      </div>
    </button>
  );
};

/**
 * Props for InfoTickerTape when using artistRelease format
 */
interface InfoTickerTapeArtistReleaseProps {
  artistRelease: { release: Release; artist: Artist };
  trackName: string;
  featuredArtist?: never;
  isPlaying?: boolean;
  onTrackSelect?: (trackId: string) => void;
}

/**
 * Props for InfoTickerTape when using featuredArtist format
 */
interface InfoTickerTapeFeaturedArtistProps {
  featuredArtist: FeaturedArtist;
  artistRelease?: never;
  trackName?: never;
  isPlaying?: boolean;
  trackTitle?: string;
  onTrackSelect?: (trackId: string) => void;
}

type InfoTickerTapeProps = InfoTickerTapeArtistReleaseProps | InfoTickerTapeFeaturedArtistProps;

/**
 * InfoTickerTape component displays scrolling information about the currently playing track.
 *
 * @param props - The component props
 * @param props.artistRelease - An object containing a release and its associated artist (option 1)
 * @param props.trackName - The name of the currently playing track (required with artistRelease)
 * @param props.featuredArtist - A FeaturedArtist object (option 2)
 *
 * @returns A ticker tape component with scrolling track information
 *
 * @remarks
 * - Displays artist/group name, release title, and track name
 * - Has a transparent background
 * - Uses CSS animation for the scrolling effect
 * - Supports two usage patterns: artistRelease + trackName OR featuredArtist
 *
 * @example
 * ```tsx
 * // Using artistRelease format
 * <MediaPlayer.InfoTickerTape
 *   artistRelease={{ release, artist }}
 *   trackName="Song Title"
 * />
 *
 * // Using featuredArtist format
 * <MediaPlayer.InfoTickerTape featuredArtist={selectedArtist} />
 * ```
 */
const InfoTickerTape = (props: InfoTickerTapeProps) => {
  const { isPlaying = false } = props;

  // Determine display values based on prop type
  let displayName: string | null;
  let releaseTitle: string | null;
  let trackTitle: string;

  if ('featuredArtist' in props && props.featuredArtist) {
    const { featuredArtist } = props;
    displayName = getFeaturedArtistDisplayName(featuredArtist);
    releaseTitle = featuredArtist.release?.title ?? null;
    trackTitle = props.trackTitle ?? '';
  } else {
    const { artistRelease, trackName } = props as InfoTickerTapeArtistReleaseProps;
    displayName = getArtistDisplayName(artistRelease.artist);
    releaseTitle = artistRelease.release.title;
    trackTitle = trackName;
  }

  return (
    <div className={`w-full rounded-b-lg bg-zinc-800 py-2 ${isPlaying ? '' : 'text-center'}`}>
      <div className="mx-3 overflow-hidden">
        <div className={`inline-block whitespace-nowrap ${isPlaying ? 'animate-marquee' : ''}`}>
          <span className="text-xs font-medium text-zinc-100">
            {trackTitle}
            {displayName && ` • by ${displayName}`}
            {releaseTitle && ` • ${releaseTitle}`}
          </span>
        </div>
      </div>
    </div>
  );
};

/**
 * Description component displays release or track description information.
 *
 * @param props - The component props
 * @param props.description - The description text to display
 *
 * @returns A paragraph element containing the description text
 *
 * @remarks
 * - This is a stub component that needs to be implemented
 * - Will display detailed information about the release, artist, or track
 * - Should accept props for the content to display
 *
 * @example
 * ```tsx
 * <MediaPlayer>
 *   <MediaPlayer.Description description={release.description} />
 * </MediaPlayer>
 * ```
 */
const Description = ({ description }: { description: string }) => <p>{description}</p>;

/**
 * TrackListDrawer component displays a collapsible drawer with a numbered list of tracks.
 *
 * @param props - The component props
 * @param props.artistRelease - An object containing a release and its associated artist
 * @param props.currentTrackId - The ID of the currently playing track
 * @param props.onTrackSelect - Optional callback function when a track is selected
 *
 * @returns A drawer component with a track list
 *
 * @remarks
 * - Displays track number, title, and duration
 * - Highlights the currently playing track
 * - Starts collapsed and expands when triggered
 * - Shows total number of tracks in the trigger button
 *
 * @example
 * ```tsx
 * <MediaPlayer>
 *   <MediaPlayer.TrackListDrawer
 *     artistRelease={{ release, artist }}
 *     currentTrackId="track-123"
 *     onTrackSelect={(trackId) => console.log(trackId)}
 *   />
 * </MediaPlayer>
 * ```
 */
const TrackListDrawer = ({
  artistName,
  artistRelease,
  currentTrackId,
  onTrackSelect,
}: {
  artistName: string;
  artistRelease: { release: Release; artist: Artist };
  currentTrackId?: string;
  onTrackSelect?: (trackId: string) => void;
}) => {
  const { release } = artistRelease;
  const allFiles = release.digitalFormats.flatMap((format) => format.files);

  /**
   * Format duration from seconds to MM:SS format
   */
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Sort tracks by track number
  const sortedFiles = [...allFiles].sort((a, b) => a.trackNumber - b.trackNumber);

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="mb-1 flex w-full items-center justify-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 focus-visible:ring-0 focus-visible:ring-offset-0"
        >
          <span>View all {allFiles.length} tracks</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="sr-only">Track List</DrawerTitle>
          <DrawerDescription asChild>
            <div>
              <h3 className="text-sm text-shadow-none">{artistName}</h3>
              <p className="mb-0 text-sm text-shadow-none">
                <em>{release.title}</em>
              </p>
              <p>
                {allFiles.length} track{allFiles.length !== 1 ? 's' : ''}
              </p>
            </div>
          </DrawerDescription>
        </DrawerHeader>
        <div className="max-h-[60vh] overflow-y-auto px-0 pb-4">
          <ol className="-ml-2 px-0">
            {sortedFiles.map((file, index) => {
              const isCurrentTrack = currentTrackId === file.id;
              const coverArt = release.coverArt || null;

              const trackItem = (
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- track selection handled by parent player component
                <li
                  key={file.id}
                  className={`flex items-center justify-between gap-4 p-3 transition-colors ${
                    isCurrentTrack
                      ? 'bg-zinc-800 text-zinc-50'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                  } ${onTrackSelect ? 'cursor-pointer' : ''}`}
                  onClick={() => onTrackSelect?.(file.id)}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className={`w-6 shrink-0 text-right text-sm font-medium ${
                        isCurrentTrack ? 'text-zinc-50!' : 'text-zinc-950 dark:text-zinc-950'
                      }`}
                    >
                      {index + 1}.
                    </span>
                    {coverArt && (
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded">
                        <Image
                          src={coverArt}
                          alt={getTrackDisplayTitle(file.title, file.fileName)}
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      </div>
                    )}
                    <span
                      className={`truncate text-sm ${
                        isCurrentTrack
                          ? 'font-semibold text-zinc-50!'
                          : 'text-zinc-950 dark:text-zinc-950'
                      }`}
                    >
                      {getTrackDisplayTitle(file.title, file.fileName)}
                    </span>
                  </div>
                  <span
                    className={`shrink-0 font-mono text-sm ${
                      isCurrentTrack ? 'text-zinc-50!' : 'text-zinc-950 dark:text-zinc-600'
                    }`}
                  >
                    {formatDuration(file.duration ?? 0)}
                  </span>
                </li>
              );

              // Wrap with DrawerClose if onTrackSelect is provided to close drawer on selection
              return onTrackSelect ? (
                <DrawerClose key={file.id} asChild>
                  {trackItem}
                </DrawerClose>
              ) : (
                trackItem
              );
            })}
          </ol>
        </div>
        <div className="border-t border-zinc-200 px-4 pt-2 pb-2 dark:border-zinc-700">
          <div className="flex justify-between text-sm text-zinc-600">
            <span>Total time</span>
            <span className="font-mono">
              {formatDuration(allFiles.reduce((total, f) => total + (f.duration ?? 0), 0))}
            </span>
          </div>
        </div>
        <DrawerClose asChild>
          <Button variant="outline" className="mx-4 mb-4">
            <ChevronUp className="mr-2 h-4 w-4" />
            Close
          </Button>
        </DrawerClose>
      </DrawerContent>
    </Drawer>
  );
};

/**
 * Props for FormatFileListDrawer
 */
interface FormatFileListDrawerProps {
  files: {
    id: string;
    trackNumber: number;
    title?: string | null;
    fileName: string;
    duration?: number | null;
    s3Key: string;
  }[];
  currentFileId: string | null;
  onFileSelect?: (fileId: string) => void;
  artistName: string;
  releaseTitle: string;
  featuredTrackNumber?: number;
  /**
   * Optional download trigger rendered alongside the "View" link. Typically a
   * `DownloadDialog` / `DeferredDownloadDialog` wrapping a `MediaActionLink`
   * with `icon={Download}`. When omitted, only the View link is rendered.
   */
  downloadTrigger?: React.ReactNode;
}

/**
 * FormatFileListDrawer component displays a collapsible drawer with digital format files.
 * Used by the FeaturedArtistsPlayer to show track-by-track navigation from ReleaseDigitalFormatFiles.
 */
const FormatFileListDrawer = ({
  files,
  currentFileId,
  onFileSelect,
  artistName,
  releaseTitle,
  featuredTrackNumber,
  downloadTrigger,
}: FormatFileListDrawerProps) => {
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <Drawer>
      {/* Stable min-h-10 keeps the row height invariant across loading
          states (skeleton, dynamic-dialog placeholder, hydrated content) so
          there's no CLS when DeferredDownloadDialog flips from button →
          dialog or when files arrive late. */}
      <div className="flex min-h-8 flex-wrap items-center justify-center gap-1.5 text-sm text-zinc-950">
        <DrawerTrigger asChild>
          <button
            type="button"
            className="focus-visible:ring-ring inline-flex cursor-pointer items-center gap-1 rounded-sm font-semibold text-zinc-950 underline hover:text-zinc-700 focus-visible:ring-2 focus-visible:outline-none"
          >
            <Eye className="size-4" aria-hidden="true" />
            View
          </button>
        </DrawerTrigger>
        {downloadTrigger && (
          <>
            <em>or</em>
            {downloadTrigger}
          </>
        )}
        <span>all {files.length} tracks</span>
      </div>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="sr-only">Track List</DrawerTitle>
          <DrawerDescription asChild>
            <div>
              <h3 className="mt-0 text-base font-semibold text-shadow-none">{artistName}</h3>
              <p className="mb-0 text-sm text-shadow-none">
                <em>{releaseTitle}</em>
              </p>
              <p>
                {files.length} track{files.length !== 1 ? 's' : ''}
              </p>
            </div>
          </DrawerDescription>
        </DrawerHeader>
        <div className="max-h-[60vh] overflow-y-auto px-0 pb-4">
          <ol className="-ml-2 px-0">
            {files.map((file) => {
              const isCurrentFile = currentFileId === file.id;
              const displayTitle = getTrackDisplayTitle(file.title, file.fileName);

              const fileItem = (
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- file selection handled by parent player component
                <li
                  key={file.id}
                  className={`flex items-center justify-between gap-4 p-3 transition-colors ${
                    isCurrentFile
                      ? 'bg-zinc-800 text-zinc-50'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                  } ${onFileSelect ? 'cursor-pointer' : ''}`}
                  onClick={() => onFileSelect?.(file.id)}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className={`w-6 shrink-0 text-right text-sm font-medium ${
                        isCurrentFile ? 'text-zinc-50!' : 'text-zinc-950 dark:text-zinc-950'
                      }`}
                    >
                      {file.trackNumber}.
                    </span>
                    <span
                      className={`truncate text-sm ${
                        isCurrentFile
                          ? 'font-semibold text-zinc-50!'
                          : 'text-zinc-950 dark:text-zinc-950'
                      }`}
                    >
                      {displayTitle}
                    </span>
                    {featuredTrackNumber != null && file.trackNumber === featuredTrackNumber && (
                      <Star
                        className={cn(
                          'h-3.5 w-3.5 shrink-0 fill-current',
                          isCurrentFile ? 'text-amber-400' : 'text-amber-500'
                        )}
                        aria-label="Featured track"
                      />
                    )}
                  </div>
                  {file.duration != null && (
                    <span
                      className={`shrink-0 font-mono text-sm ${
                        isCurrentFile ? 'text-zinc-50!' : 'text-zinc-950 dark:text-zinc-600'
                      }`}
                    >
                      {formatDuration(file.duration)}
                    </span>
                  )}
                </li>
              );

              return onFileSelect ? (
                <DrawerClose key={file.id} asChild>
                  {fileItem}
                </DrawerClose>
              ) : (
                fileItem
              );
            })}
          </ol>
        </div>
        {files.some((f) => f.duration != null) && (
          <div className="border-t border-zinc-200 px-4 pt-2 pb-2 dark:border-zinc-700">
            <div className="flex justify-between text-sm text-zinc-600">
              <span>Total time</span>
              <span className="font-mono">
                {formatDuration(files.reduce((total, f) => total + (f.duration ?? 0), 0))}
              </span>
            </div>
          </div>
        )}
        <DrawerClose asChild>
          <Button variant="outline" className="mx-4 mb-4">
            <ChevronUp className="mr-2 h-4 w-4" />
            Close
          </Button>
        </DrawerClose>
      </DrawerContent>
    </Drawer>
  );
};

/**
 * Interface for navigation menu items.
 *
 * @property label - The display text for the menu item
 * @property onClick - Optional callback function when the menu item is clicked
 */
interface NavMenuItem {
  label: string;
  onClick?: () => void;
}

/**
 * DotNavMenuTrigger component displays a trigger button with an ellipsis icon.
 *
 * @param props - The component props
 * @param props.onClick - Callback function when the trigger button is clicked
 *
 * @returns A button component with an ellipsis vertical icon
 *
 * @remarks
 * - Uses the EllipsisVertical icon from lucide-react
 * - Styled as a ghost button with hover states
 * - Includes proper ARIA label for accessibility
 * - Works in both light and dark modes
 *
 * @example
 * ```tsx
 * <MediaPlayer>
 *   <MediaPlayer.DotNavMenuTrigger onClick={() => setMenuOpen(true)} />
 * </MediaPlayer>
 * ```
 */
const DotNavMenuTrigger = ({ onClick }: { onClick: ({ isOpen }: { isOpen: boolean }) => void }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = () => {
    const _isOpen = !isOpen;

    setIsOpen(_isOpen);
    onClick({ isOpen: _isOpen });
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      onClick={handleToggle}
      aria-label="Open menu"
    >
      <EllipsisVertical className="h-4 w-4" />
    </Button>
  );
};

/**
 * DotNavMenu component displays a navigation menu with a list of menu items.
 *
 * @param props - The component props
 * @param props.navMenuItems - Array of navigation menu items to display
 *
 * @returns A menu component with navigation items
 *
 * @remarks
 * - Only renders when navMenuItems array is not empty
 * - Maps through navMenuItems to render DotNavMenuItem components
 * - Typically used in conjunction with DotNavMenuTrigger
 * - Suitable for contextual actions related to the media player
 *
 * @example
 * ```tsx
 * const menuItems = [
 *   { label: 'Add to playlist', onClick: () => {} },
 *   { label: 'Share', onClick: () => {} },
 *   { label: 'Download', onClick: () => {} },
 * ];
 * <MediaPlayer.DotNavMenu navMenuItems={menuItems} />
 * ```
 */
const DotNavMenu = ({ navMenuItems }: { navMenuItems: NavMenuItem[] }) => {
  return (
    <>
      {navMenuItems.length > 0 && (
        <div className="relative" role="menu">
          <div className="py-1">
            {navMenuItems.map((item) => (
              <DotNavMenuItem key={item.label} navMenuItem={item} />
            ))}
          </div>
        </div>
      )}
    </>
  );
};

/**
 * DotNavMenuItem component displays a single menu item within the DotNavMenu.
 *
 * @param props - The component props
 * @param props.navMenuItem - The menu item object containing label and optional onClick handler
 *
 * @returns A clickable menu item element
 *
 * @remarks
 * - Renders as a div with menuitem role for accessibility
 * - Includes hover styles for better UX
 * - Styled to match the overall media player theme
 * - Supports both light and dark color schemes
 *
 * @example
 * ```tsx
 * const menuItem = { label: 'Add to playlist', onClick: handleAddToPlaylist };
 *
 * <MediaPlayer>
 *   <MediaPlayer.DotNavMenuItem navMenuItem={menuItem} />
 * </MediaPlayer>
 * ```
 */
const DotNavMenuItem = ({ navMenuItem }: { navMenuItem: NavMenuItem }) => {
  return (
    <div
      className="block w-full px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
      role="menuitem"
    >
      {navMenuItem.label}
    </div>
  );
};

/**
 * SocialSharer component provides social media sharing functionality.
 *
 * @returns A placeholder div for social sharing features
 *
 * @remarks
 * - This is a stub component that needs to be implemented
 * - Should provide buttons/links to share on various social media platforms
 * - Typical platforms include: Facebook, Twitter/X, Instagram, etc.
 * - Should accept props for the content to share (track, release, artist info)
 *
 * @example
 * ```tsx
 * <MediaPlayer>
 *   <MediaPlayer.SocialSharer />
 * </MediaPlayer>
 * ```
 */
const SocialSharer = () => <div>SocialSharer</div>;

/**
 * Props interface for the main MediaPlayer component.
 * @property children - One or more MediaPlayer sub-components
 * @property artists - Optional array of artist objects (currently unused, reserved for future use)
 * @property className - Optional CSS class names to apply to the container
 */
interface MediaPlayerProps {
  children: React.ReactNode;
  className?: string;
  artists?: Artist[];
}

export const MediaPlayer = ({ children, className }: MediaPlayerProps) => (
  <div className={className}>{children}</div>
);

MediaPlayer.CoverArtView = CoverArtView;
MediaPlayer.InteractiveCoverArt = InteractiveCoverArt;
MediaPlayer.InfoTickerTape = InfoTickerTape;
MediaPlayer.Controls = LazyControls;
MediaPlayer.CoverArtCarousel = CoverArtCarousel;
MediaPlayer.FeaturedArtistCarousel = FeaturedArtistCarousel;
MediaPlayer.Description = Description;
MediaPlayer.DotNavMenu = DotNavMenu;
MediaPlayer.DotNavMenuItem = DotNavMenuItem;
MediaPlayer.DotNavMenuTrigger = DotNavMenuTrigger;
MediaPlayer.TrackListDrawer = TrackListDrawer;
MediaPlayer.FormatFileListDrawer = FormatFileListDrawer;
MediaPlayer.SocialSharer = SocialSharer;
