/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import Image from 'next/image';

import { ChevronDown, ChevronUp, EllipsisVertical, Pause, Play } from 'lucide-react';
import videojs from 'video.js';

import {
  getAudioRewindButton,
  getAudioFastForwardButton,
  getSkipPreviousButton,
  getSkipNextButton,
  resetClasses,
} from '@/app/components/ui/audio/audio-controls';
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
import { buildCdnUrl } from '@/lib/utils/cdn-url';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import { getFeaturedArtistDisplayName } from '@/lib/utils/get-featured-artist-display-name';
import { getTrackDisplayTitle } from '@/lib/utils/get-track-display-title';

import type Player from 'video.js/dist/types/player';

import 'video.js/dist/video-js.css';
import './videojs-audio.css';

// Register VideoJS components once at module level
/**
 * Registers custom VideoJS components if they haven't been registered yet.
 * Must be called only when video.js is fully loaded (inside useEffect).
 *
 * Always verifies components are actually in Video.js's registry to handle
 * state resets during Next.js client-side navigation.
 *
 * @returns true if all components were registered successfully
 */
const registerVideoJSComponents = (): boolean => {
  // Always force a fresh rebuild and registration.
  // After player.dispose(), Video.js may silently drop custom components
  // from its registry while keeping the same Button base class reference,
  // making cached-reference checks unreliable.
  resetClasses();

  const getters: [string, () => ReturnType<typeof videojs.getComponent> | null][] = [
    ['AudioRewindButton', getAudioRewindButton],
    ['AudioFastForwardButton', getAudioFastForwardButton],
    ['SkipPreviousButton', getSkipPreviousButton],
    ['SkipNextButton', getSkipNextButton],
  ];

  for (const [name, getComponent] of getters) {
    const component = getComponent();
    if (!component) {
      return false;
    }
    videojs.registerComponent(name, component);
  }

  return true;
};

/**
 * Determines the correct MIME type for an audio URL based on its file extension.
 * Falls back to 'audio/mpeg' if the extension cannot be determined.
 *
 * @param url - The audio file URL (may include query parameters)
 * @returns The corresponding MIME type string
 */
const getAudioMimeType = (url: string): string => {
  const extension = url.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    mp3: 'audio/mpeg',
    mpeg: 'audio/mpeg',
    wav: 'audio/wav',
    wave: 'audio/wav',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    aac: 'audio/aac',
    m4a: 'audio/mp4',
    webm: 'audio/webm',
    aiff: 'audio/aiff',
    aif: 'audio/aiff',
  };
  return mimeTypes[extension ?? ''] ?? 'audio/mpeg';
};

/**
 * Browser media stacks can emit transient decode/abort errors while switching
 * sources quickly. These are often recoverable and should not show the Video.js
 * error overlay to users.
 */
const isTransientSourceSwitchError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const mediaError = error as { message?: string };
  const message = mediaError.message?.toLowerCase() ?? '';

  return /aborted due to a corruption|corruption problem|media playback was aborted/.test(message);
};

const clearPlayerErrorState = (player: Player): void => {
  const playerWithErrorApi = player as Player & {
    error?: (value?: null) => unknown;
    removeClass?: (className: string) => void;
    el?: () => Element | null;
  };

  if (typeof playerWithErrorApi.error === 'function') {
    playerWithErrorApi.error(null);
  }

  if (typeof playerWithErrorApi.removeClass === 'function') {
    playerWithErrorApi.removeClass('vjs-error');
  }

  const playerElement =
    typeof playerWithErrorApi.el === 'function' ? playerWithErrorApi.el() : null;
  const errorDisplay = playerElement?.querySelector('.vjs-error-display');
  if (errorDisplay instanceof HTMLElement) {
    errorDisplay.classList.add('vjs-hidden');
    errorDisplay.setAttribute('aria-hidden', 'true');
  }
};

/**
 * Interface for accessing player controls from parent components.
 *
 * @property play - Function to start playback
 * @property pause - Function to pause playback
 * @property toggle - Function to toggle between play and pause
 */
export interface MediaPlayerControls {
  play: () => void;
  pause: () => void;
  toggle: () => void;
}

/**
 * Props interface for the MediaControls component.
 *
 * @property audioSrc - The source URL for the audio file
 * @property onPreviousTrack - Optional callback function for previous track navigation (wasPlaying indicates if should auto-play)
 * @property onNextTrack - Optional callback function for next track navigation (wasPlaying indicates if should auto-play)
 * @property onPlay - Optional callback function when playback starts
 * @property onPause - Optional callback function when playback pauses
 * @property onEnded - Optional callback function when playback ends
 * @property autoPlay - Optional flag to auto-play when source changes
 * @property controlsRef - Optional callback to receive player control methods
 */
interface MediaControlsProps {
  audioSrc: string;
  onPreviousTrack?: (wasPlaying: boolean) => void;
  onNextTrack?: (wasPlaying: boolean) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  autoPlay?: boolean;
  controlsRef?: (controls: MediaPlayerControls | null) => void;
}

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
                width={84}
                height={84}
              />
            </CarouselItem>
          );
        })}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
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
  onSelect,
}: {
  featuredArtists: FeaturedArtist[];
  onSelect?: (featuredArtist: FeaturedArtist) => void;
}) => {
  // Sort by position (lower numbers first)
  const sortedArtists = [...featuredArtists].sort((a, b) => a.position - b.position);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();

  const handleSelect = (featured: FeaturedArtist, index: number) => {
    carouselApi?.scrollTo(index);
    onSelect?.(featured);
  };

  /**
   * Get the cover art URL for a featured artist
   */
  const getCoverArt = (featured: FeaturedArtist): string | null => {
    // Use featured coverArt if available
    if (featured.coverArt) {
      return featured.coverArt;
    }
    // Fall back to release coverArt
    if (featured.release?.coverArt) {
      return featured.release.coverArt;
    }
    // Fall back to first image in the release
    if (featured.release?.images?.length && featured.release.images[0].src) {
      return featured.release.images[0].src;
    }
    // Fall back to first artist's first image
    if (featured.artists?.length > 0) {
      for (const artist of featured.artists) {
        if (artist.images?.length > 0) {
          return artist.images[0].src;
        }
      }
    }
    return null;
  };

  return (
    <Carousel
      aria-label="Featured Artists"
      orientation="horizontal"
      className="w-full px-10 mb-0"
      opts={{ loop: true, align: 'center' }}
      setApi={setCarouselApi}
    >
      <CarouselContent className="-ml-2">
        {sortedArtists.map((featured, index) => {
          const coverArt = getCoverArt(featured);
          const displayName = getFeaturedArtistDisplayName(featured);
          const imageError = failedImages.has(featured.id);

          return (
            <CarouselItem
              key={featured.id}
              className="pl-2 pt-1 pb-4 basis-1/3 sm:basis-1/4 md:basis-1/5 lg:basis-1/6 shrink-0"
            >
              <button
                type="button"
                onClick={() => handleSelect(featured, index)}
                className="group relative w-full aspect-square rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                aria-label={`Select ${displayName}`}
              >
                <div className="absolute inset-0 overflow-hidden rounded-lg">
                  {coverArt && !imageError ? (
                    <Image
                      src={coverArt}
                      alt={displayName}
                      fill
                      className="object-cover transition-transform group-hover:scale-105"
                      sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, (max-width: 1024px) 20vw, 14vw"
                      onError={() => {
                        setFailedImages((prev) => new Set(prev).add(featured.id));
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-zinc-200 flex items-center justify-center">
                      <span className="text-zinc-500 text-xs text-center px-1">{displayName}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end justify-center">
                    <span className="text-white text-xs font-medium pb-2 opacity-0 group-hover:opacity-100 transition-opacity truncate px-1 max-w-full">
                      {displayName}
                    </span>
                  </div>
                </div>
              </button>
            </CarouselItem>
          );
        })}
      </CarouselContent>
      <CarouselPrevious className="left-0" />
      <CarouselNext className="right-0" />
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
      className="w-full aspect-square object-cover rounded-lg"
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
      className={`relative w-full aspect-square group cursor-pointer focus:outline-none rounded-t-lg overflow-hidden ${className ?? ''}`}
      aria-label={isPlaying ? 'Pause' : 'Play'}
    >
      {imageError ? (
        <div className="w-full h-full bg-zinc-200 flex items-center justify-center">
          <Play className="w-12 h-12 text-zinc-400" />
        </div>
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          className="object-cover"
          sizes="calc(100vw - 1rem)"
          onError={() => setImageError(true)}
        />
      )}
      {/* Overlay - visible when not playing or briefly when pausing */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
          showOverlay ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Nearly transparent background */}
        <div className="absolute inset-0 bg-black/10" />
        {/* Icon container */}
        <div className="relative z-10 flex items-center justify-center w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm">
          <OverlayIcon className="w-8 h-8 text-white/30 drop-shadow-md" />
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
    <div className={`w-full bg-zinc-800 py-2 rounded-b-lg ${isPlaying ? '' : 'text-center'}`}>
      <div className="overflow-hidden mx-3">
        <div className={`whitespace-nowrap inline-block ${isPlaying ? 'animate-marquee' : ''}`}>
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
 * Controls component for the media player.
 *
 * @param props - The component props
 * @param props.audioSrc - The source URL for the audio file
 * @param props.onPreviousTrack - Optional callback function for previous track action
 * @param props.onNextTrack - Optional callback function for next track action
 *
 * @returns The rendered audio player controls component
 *
 * @remarks
 * - Uses video.js library for audio playback
 * - Includes time displays, progress control, play/pause, skip controls, and volume panel
 * - Skip buttons jump 10 seconds forward/backward
 * - Responsive design with full width on mobile
 *
 * @example
 * ```tsx
 * <MediaPlayer>
 *   <MediaPlayer.Controls
 *     audioSrc="/path/to/audio.mp3"
 *     onPreviousTrack={handlePrevious}
 *     onNextTrack={handleNext}
 *   />
 * </MediaPlayer>
 * ```
 */
const Controls = ({
  audioSrc,
  onPreviousTrack,
  onNextTrack,
  onPlay,
  onPause,
  onEnded,
  autoPlay = false,
  controlsRef,
}: MediaControlsProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const isInitializedRef = useRef(false);
  const isSwitchingSourceRef = useRef(false);
  const pendingResumePlaybackRef = useRef(false);
  const transientErrorRecoveryAttemptedRef = useRef(false);
  const initialSourceRef = useRef(audioSrc);
  const lastPreviousClickRef = useRef<number>(0);
  const SKIP_TIME = 10;
  const DOUBLE_CLICK_THRESHOLD = 1000;
  const REWIND_THRESHOLD = 3;

  // Use refs for callbacks to avoid re-running the effect when they change
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onEndedRef = useRef(onEnded);
  const onPreviousTrackRef = useRef(onPreviousTrack);
  const onNextTrackRef = useRef(onNextTrack);
  const controlsRefCallback = useRef(controlsRef);

  // Keep refs up to date
  useEffect(() => {
    onPlayRef.current = onPlay;
    onPauseRef.current = onPause;
    onEndedRef.current = onEnded;
    onPreviousTrackRef.current = onPreviousTrack;
    onNextTrackRef.current = onNextTrack;
    controlsRefCallback.current = controlsRef;
  }, [onPlay, onPause, onEnded, onPreviousTrack, onNextTrack, controlsRef]);

  // Initialize player once
  useEffect(() => {
    // Bail out if already initialized or no container
    if (isInitializedRef.current || !containerRef.current) return;

    /**
     * Attempts to register Video.js components and create the player.
     * Returns true if successful, false if Video.js isn't ready yet.
     */
    const initPlayer = (): boolean => {
      // Verify Video.js is fully loaded — Button must be available
      if (!videojs.getComponent('Button')) {
        return false;
      }

      // Register custom components (always force-rebuilds)
      if (!registerVideoJSComponents()) {
        return false;
      }

      // Double-check registration actually stuck
      const BaseButton = videojs.getComponent('Button');
      const allRegistered = [
        'AudioRewindButton',
        'AudioFastForwardButton',
        'SkipPreviousButton',
        'SkipNextButton',
      ].every((name) => {
        const comp = videojs.getComponent(name);
        return comp && comp !== BaseButton;
      });

      if (!allRegistered) {
        return false;
      }

      if (!containerRef.current) return false;

      // Create audio element dynamically
      const audioEl = document.createElement('audio');
      audioEl.className = 'video-js vjs-default-skin';
      audioEl.setAttribute('playsinline', '');
      audioEl.setAttribute('webkit-playsinline', '');
      containerRef.current.appendChild(audioEl);
      audioElRef.current = audioEl;

      const player = videojs(audioEl, {
        controls: true,
        autoplay: false,
        preload: 'auto',
        playsinline: true,
        responsive: true,
        inactivityTimeout: 0,
        userActions: {
          hotkeys: true,
        },
        sources: [{ src: audioSrc, type: getAudioMimeType(audioSrc) }],
        fluid: false,
        fill: false,
        controlBar: {
          children: [
            'currentTimeDisplay',
            'progressControl',
            'durationDisplay',
            'skipPreviousButton',
            {
              name: 'audioRewindButton',
              seconds: SKIP_TIME,
            },
            'playToggle',
            {
              name: 'audioFastForwardButton',
              seconds: SKIP_TIME,
            },
            'skipNextButton',
            'volumePanel',
          ],
          volumePanel: {
            inline: false,
            vertical: false,
          },
        },
      });

      playerRef.current = player;
      isInitializedRef.current = true;

      player.ready(() => {
        player.addClass('vjs-audio');
        player.addClass('vjs-has-started');
        player.userActive(true);

        if (controlsRefCallback.current) {
          const controls: MediaPlayerControls = {
            play: () => {
              const playPromise = player.play();
              if (playPromise !== undefined) {
                (playPromise as Promise<void>).catch(() => {
                  // iOS may reject play() if not initiated by a user gesture
                });
              }
            },
            pause: () => player.pause(),
            toggle: () => {
              if (player.paused()) {
                const playPromise = player.play();
                if (playPromise !== undefined) {
                  (playPromise as Promise<void>).catch(() => {
                    // iOS may reject play() if not initiated by a user gesture
                  });
                }
              } else {
                player.pause();
              }
            },
          };
          controlsRefCallback.current(controls);
        }
      });

      player.on('play', () => {
        isSwitchingSourceRef.current = false;
        pendingResumePlaybackRef.current = false;
        transientErrorRecoveryAttemptedRef.current = false;
        player.userActive(true);
        onPlayRef.current?.();
      });

      player.on('pause', () => {
        onPauseRef.current?.();
      });

      player.on('ended', () => {
        isSwitchingSourceRef.current = false;
        pendingResumePlaybackRef.current = false;
        transientErrorRecoveryAttemptedRef.current = false;
        onPauseRef.current?.();
        onEndedRef.current?.();
      });

      player.on('canplay', () => {
        isSwitchingSourceRef.current = false;
        transientErrorRecoveryAttemptedRef.current = false;
      });

      player.on('error', () => {
        const mediaError = player.error();
        if (
          isTransientSourceSwitchError(mediaError) &&
          !transientErrorRecoveryAttemptedRef.current
        ) {
          transientErrorRecoveryAttemptedRef.current = true;
          const playerWithCurrentSrc = player as Player & {
            currentSrc?: string | (() => string);
          };
          const currentSrcValue =
            typeof playerWithCurrentSrc.currentSrc === 'function'
              ? playerWithCurrentSrc.currentSrc()
              : playerWithCurrentSrc.currentSrc;
          const sourceToRetry = currentSrcValue || audioSrc;
          const shouldResume = pendingResumePlaybackRef.current || !player.paused();

          clearPlayerErrorState(player);
          if (sourceToRetry) {
            player.src({ src: sourceToRetry, type: getAudioMimeType(sourceToRetry) });
            player.load();
            if (shouldResume) {
              const playPromise = player.play();
              if (playPromise !== undefined) {
                (playPromise as Promise<void>).catch(() => {
                  // If retry fails, allow normal Video.js error handling on the next error event
                });
              }
            }
          }
          return;
        }

        isSwitchingSourceRef.current = false;
        pendingResumePlaybackRef.current = false;
      });

      player.on('userinactive', () => {
        player.userActive(true);
      });

      player.on('skipprevious', () => {
        const currentTime = player.currentTime() || 0;
        const wasPlaying = !player.paused();
        const now = Date.now();
        const timeSinceLastClick = now - lastPreviousClickRef.current;
        lastPreviousClickRef.current = now;

        if (currentTime < REWIND_THRESHOLD || timeSinceLastClick < DOUBLE_CLICK_THRESHOLD) {
          if (onPreviousTrackRef.current) {
            onPreviousTrackRef.current(wasPlaying);
          }
        } else {
          player.currentTime(0);
          if (wasPlaying) {
            const playPromise = player.play();
            if (playPromise !== undefined) {
              (playPromise as Promise<void>).catch(() => {
                // iOS may reject play() after seeking
              });
            }
          }
        }
      });

      player.on('skipnext', () => {
        const wasPlaying = !player.paused();
        if (onNextTrackRef.current) {
          onNextTrackRef.current(wasPlaying);
        }
      });

      return true;
    };

    // Try to initialize immediately
    if (initPlayer()) return;

    // If Video.js wasn't ready, retry with increasing delays.
    // This handles the case where client-side navigation causes
    // Video.js to be in a transitional state when useEffect fires.
    let retryCount = 0;
    const maxRetries = 10;
    const retryDelays = [0, 10, 25, 50, 100, 150, 200, 300, 500, 1000];

    const retryInit = () => {
      retryCount++;
      if (retryCount > maxRetries || isInitializedRef.current) return;

      if (!initPlayer()) {
        const delay = retryDelays[Math.min(retryCount, retryDelays.length - 1)];
        setTimeout(retryInit, delay);
      }
    };

    // Start retry loop with requestAnimationFrame to wait for next paint
    requestAnimationFrame(() => {
      if (!isInitializedRef.current) {
        retryInit();
      }
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
        audioElRef.current = null;
        isInitializedRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update source when audioSrc changes (without recreating player)
  useEffect(() => {
    if (playerRef.current && isInitializedRef.current) {
      const isInitialSource = audioSrc === initialSourceRef.current;
      const wasPlayingBeforeSourceChange = !playerRef.current.paused();
      isSwitchingSourceRef.current = true;
      transientErrorRecoveryAttemptedRef.current = false;
      pendingResumePlaybackRef.current =
        wasPlayingBeforeSourceChange || (autoPlay && !isInitialSource);
      clearPlayerErrorState(playerRef.current);
      playerRef.current.src({ src: audioSrc, type: getAudioMimeType(audioSrc) });
      playerRef.current.load();
      // Ensure controls remain visible after source change
      playerRef.current.addClass('vjs-has-started');
      playerRef.current.userActive(true);

      // Auto-play if enabled and this is not the initial source
      if (autoPlay && !isInitialSource) {
        const playPromise = playerRef.current.play();
        if (playPromise !== undefined) {
          (playPromise as Promise<void>).catch(() => {
            // iOS may reject autoplay after source change
          });
        }
      }
      // Update initial source ref after first change
      if (isInitialSource) {
        initialSourceRef.current = '';
      }
    }
  }, [audioSrc, autoPlay]);

  return <div ref={containerRef} className="audio-player-wrapper min-h-14" data-vjs-player />;
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
          className="w-full flex items-center justify-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 mb-1 focus-visible:ring-0 focus-visible:ring-offset-0"
        >
          <span>View all {allFiles.length} tracks</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="sr-only">Track List</DrawerTitle>
          <DrawerDescription>
            <h3 className="text-sm text-shadow-none mb-0 leading-1">{artistName}</h3>
            <p className="text-sm text-shadow-none mb-0">
              <em>{release.title}</em>
            </p>
            <p>
              {allFiles.length} track{allFiles.length !== 1 ? 's' : ''}
            </p>
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-0 pb-4 max-h-[60vh] overflow-y-auto">
          <ol className="px-0 -ml-2">
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
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span
                      className={`text-sm font-medium w-6 shrink-0 text-right ${
                        isCurrentTrack ? 'text-zinc-50!' : 'text-zinc-500 dark:text-zinc-500'
                      }`}
                    >
                      {index + 1}.
                    </span>
                    {coverArt && (
                      <div className="relative w-10 h-10 shrink-0 rounded overflow-hidden">
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
                      className={`text-sm truncate ${
                        isCurrentTrack
                          ? 'font-semibold text-zinc-50!'
                          : 'text-zinc-500 dark:text-zinc-500'
                      }`}
                    >
                      {getTrackDisplayTitle(file.title, file.fileName)}
                    </span>
                  </div>
                  <span
                    className={`text-sm shrink-0 font-mono ${
                      isCurrentTrack ? 'text-zinc-50!' : 'text-zinc-500 dark:text-zinc-600'
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
        <div className="px-4 pb-2 border-t border-zinc-200 dark:border-zinc-700 pt-2">
          <div className="flex justify-between text-sm text-zinc-600">
            <span>Total time</span>
            <span className="font-mono">
              {formatDuration(allFiles.reduce((total, f) => total + (f.duration ?? 0), 0))}
            </span>
          </div>
        </div>
        <DrawerClose asChild>
          <Button variant="outline" className="mx-4 mb-4">
            <ChevronUp className="h-4 w-4 mr-2" />
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
}: FormatFileListDrawerProps) => {
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Debug: extract and log audio metadata (ID3 tags) from CDN files
  useEffect(() => {
    if (files.length === 0) return;

    const extractMetadata = async () => {
      try {
        const { parseBlob } = await import('music-metadata');
        const firstFile = files[0];
        const cdnUrl = buildCdnUrl(firstFile.s3Key);
        const response = await fetch(cdnUrl);
        const blob = await response.blob();
        const metadata = await parseBlob(blob);
        console.info('[metadata] Extracted ID3 tags from first track:', {
          title: metadata.common.title,
          artist: metadata.common.artist,
          album: metadata.common.album,
          albumArtist: metadata.common.albumartist,
          year: metadata.common.year,
          genre: metadata.common.genre,
          label: metadata.common.label,
          trackNumber: metadata.common.track?.no,
          trackTotal: metadata.common.track?.of,
          duration: metadata.format.duration
            ? `${Math.round(metadata.format.duration)}s`
            : undefined,
          bitrate: metadata.format.bitrate
            ? `${Math.round(metadata.format.bitrate / 1000)}kbps`
            : undefined,
          codec: metadata.format.codec,
          hasCoverArt: (metadata.common.picture?.length ?? 0) > 0,
        });
      } catch (err) {
        console.info('[metadata] Could not extract metadata:', err);
      }
    };

    extractMetadata();
  }, [files]);

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full flex items-center justify-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 mb-1 focus-visible:ring-0 focus-visible:ring-offset-0"
        >
          <span>View all {files.length} tracks</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="sr-only">Track List</DrawerTitle>
          <DrawerDescription>
            <div>
              <h3 className="text-sm text-shadow-none mb-0 leading-1">{artistName}</h3>
              <p className="text-sm text-shadow-none mb-0">
                <em>{releaseTitle}</em>
              </p>
              <p>
                {files.length} track{files.length !== 1 ? 's' : ''}
              </p>
            </div>
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-0 pb-4 max-h-[60vh] overflow-y-auto">
          <ol className="px-0 -ml-2">
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
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span
                      className={`text-sm font-medium w-6 shrink-0 text-right ${
                        isCurrentFile ? 'text-zinc-50!' : 'text-zinc-500 dark:text-zinc-500'
                      }`}
                    >
                      {file.trackNumber}.
                    </span>
                    <span
                      className={`text-sm truncate ${
                        isCurrentFile
                          ? 'font-semibold text-zinc-50!'
                          : 'text-zinc-500 dark:text-zinc-500'
                      }`}
                    >
                      {displayTitle}
                    </span>
                  </div>
                  {file.duration != null && (
                    <span
                      className={`text-sm shrink-0 font-mono ${
                        isCurrentFile ? 'text-zinc-50!' : 'text-zinc-500 dark:text-zinc-600'
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
          <div className="px-4 pb-2 border-t border-zinc-200 dark:border-zinc-700 pt-2">
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
            <ChevronUp className="h-4 w-4 mr-2" />
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
      className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 w-full text-left"
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
MediaPlayer.Controls = Controls;
MediaPlayer.CoverArtCarousel = CoverArtCarousel;
MediaPlayer.FeaturedArtistCarousel = FeaturedArtistCarousel;
MediaPlayer.Description = Description;
MediaPlayer.DotNavMenu = DotNavMenu;
MediaPlayer.DotNavMenuItem = DotNavMenuItem;
MediaPlayer.DotNavMenuTrigger = DotNavMenuTrigger;
MediaPlayer.TrackListDrawer = TrackListDrawer;
MediaPlayer.FormatFileListDrawer = FormatFileListDrawer;
MediaPlayer.SocialSharer = SocialSharer;
