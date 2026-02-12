'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import Image from 'next/image';

import {
  ChevronDown,
  ChevronUp,
  EllipsisVertical,
  Pause,
  Play,
  Search as SearchIcon,
} from 'lucide-react';
import videojs from 'video.js';

import TextField from '@/components/forms/fields/text-field';
import { Button } from '@/components/ui/button';
import {
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
import { getFeaturedArtistDisplayName } from '@/lib/utils/get-featured-artist-display-name';

import {
  AudioFastForwardButton,
  AudioRewindButton,
  SkipNextButton,
  SkipPreviousButton,
} from '../audio-controls';

import type { Control } from 'react-hook-form';
import type Player from 'video.js/dist/types/player';

import 'video.js/dist/video-js.css';
import './videojs-audio.css';

// Register VideoJS components once at module level
let componentsRegistered = false;
const registerVideoJSComponents = () => {
  if (componentsRegistered) return;
  videojs.registerComponent('AudioRewindButton', AudioRewindButton);
  videojs.registerComponent('AudioFastForwardButton', AudioFastForwardButton);
  videojs.registerComponent('SkipPreviousButton', SkipPreviousButton);
  videojs.registerComponent('SkipNextButton', SkipNextButton);
  componentsRegistered = true;
};

/**
 * Form values interface for the search component.
 *
 * @property search - The search query string
 */
export interface SearchFormValues {
  search: string;
}

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
 * Search component for the media player.
 *
 * @param control - The react-hook-form control object
 * @returns The rendered search component
 *
 * @remarks
 * - Uses a TextField for input and a Button for submission
 * - Placeholder text is "Search..."
 * - Button has a search icon and is labeled for accessibility
 * @example
 * ```tsx
 * <MediaPlayer>
 *   <MediaPlayer.Search control={form.control} />
 *   ...
 * </MediaPlayer>
 * ```
 */
const Search = ({ control }: { control: Control<SearchFormValues> }) => {
  const handleSearch = () => {
    // TODO: Implement search functionality
  };

  return (
    <div className="flex w-full">
      <div className="flex-1">
        <TextField
          control={control}
          name="search"
          label=""
          placeholder="Search..."
          type="text"
          className="[&_input]:rounded-r-none [&_input]:border-r-0 [&_input]:focus-visible:z-10 [&_label]:sr-only"
        />
      </div>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="rounded-l-none mt-auto mb-auto"
        onClick={handleSearch}
        aria-label="Search"
      >
        <SearchIcon />
      </Button>
    </div>
  );
};

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
            (a, b) => b.release.releasedOn.getTime() - a.release.releasedOn.getTime()
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
      className="w-full px-10 mb-5"
      opts={{ loop: true, align: 'start' }}
    >
      <CarouselContent className="-ml-2">
        {sortedArtists.map((featured) => {
          const coverArt = getCoverArt(featured);
          const displayName = getFeaturedArtistDisplayName(featured);
          const imageError = failedImages.has(featured.id);

          return (
            <CarouselItem
              key={featured.id}
              className="pl-2 pt-1 pb-1 basis-1/3 sm:basis-1/4 md:basis-1/5 lg:basis-1/6 shrink-0"
            >
              <button
                type="button"
                onClick={() => onSelect?.(featured)}
                className="group relative w-full aspect-square rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
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
  let displayName: string;
  let releaseTitle: string | null;
  let trackTitle: string;
  let showTrackListDrawer = false;
  let artistReleaseForDrawer: { release: Release; artist: Artist } | null = null;
  let currentTrackId: string | undefined;

  if ('featuredArtist' in props && props.featuredArtist) {
    const { featuredArtist } = props;
    displayName = getFeaturedArtistDisplayName(featuredArtist);
    releaseTitle = featuredArtist.release?.title ?? null;
    trackTitle = featuredArtist.track?.title ?? '';
    currentTrackId = featuredArtist.track?.id;
    // Show TrackListDrawer if the release has more than 1 track and a primary artist is available
    const primaryArtist = featuredArtist.artists?.[0];
    if (
      featuredArtist.release &&
      featuredArtist.release.releaseTracks.length > 1 &&
      primaryArtist
    ) {
      showTrackListDrawer = true;
      // Convert FeaturedArtist to the artistRelease format expected by TrackListDrawer
      artistReleaseForDrawer = {
        release: featuredArtist.release as Release,
        artist: primaryArtist as Artist,
      };
    }
  } else {
    const { artistRelease, trackName } = props;
    displayName = getArtistDisplayName(artistRelease.artist);
    releaseTitle = artistRelease.release.title;
    trackTitle = trackName;
    // For artistRelease format, find the track ID by matching title
    const matchingTrack = artistRelease.release.releaseTracks.find(
      (rt) => rt.track.title === trackName
    );
    currentTrackId = matchingTrack?.track.id;
    showTrackListDrawer = artistRelease.release.releaseTracks.length > 1;
    artistReleaseForDrawer = artistRelease;
  }

  return (
    <>
      <div
        className={`w-full overflow-hidden bg-zinc-800 py-2 rounded-b-lg ${isPlaying ? '' : 'text-center'}`}
      >
        <div className={`whitespace-nowrap inline-block ${isPlaying ? 'animate-marquee' : ''}`}>
          <span className="text-xs font-medium text-zinc-100">
            {trackTitle} • by {displayName}
            {releaseTitle && ` • ${releaseTitle}`}
          </span>
        </div>
      </div>
      {showTrackListDrawer && artistReleaseForDrawer && (
        <MediaPlayer.TrackListDrawer
          artistRelease={artistReleaseForDrawer}
          currentTrackId={currentTrackId}
          onTrackSelect={'featuredArtist' in props ? props.onTrackSelect : undefined}
        />
      )}
    </>
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
  const initialSourceRef = useRef(audioSrc); // Track initial source to skip auto-play on mount
  const lastPreviousClickRef = useRef<number>(0); // Track time of last previous click for double-click detection
  const SKIP_TIME = 10; // seconds for rewind/fast-forward
  const DOUBLE_CLICK_THRESHOLD = 1000; // ms - time window for considering a "double click" for previous track
  const REWIND_THRESHOLD = 3; // seconds - if within this time from start, go to previous track on first click

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
    // Register components once
    registerVideoJSComponents();

    if (!containerRef.current || isInitializedRef.current) return;

    // Create audio element dynamically
    const audioEl = document.createElement('audio');
    audioEl.className = 'video-js vjs-default-skin';
    containerRef.current.appendChild(audioEl);
    audioElRef.current = audioEl;

    const player = videojs(audioEl, {
      controls: true,
      autoplay: false,
      preload: 'auto',
      responsive: true,
      inactivityTimeout: 0,
      userActions: {
        hotkeys: true,
      },
      sources: [{ src: audioSrc, type: 'audio/mp3' }],
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

      // Expose player controls via controlsRef after player is ready
      if (controlsRefCallback.current) {
        const controls: MediaPlayerControls = {
          play: () => player.play(),
          pause: () => player.pause(),
          toggle: () => {
            if (player.paused()) {
              player.play();
            } else {
              player.pause();
            }
          },
        };
        controlsRefCallback.current(controls);
      }
    });

    player.on('play', () => {
      player.userActive(true);
      onPlayRef.current?.();
    });

    player.on('pause', () => {
      onPauseRef.current?.();
    });

    player.on('ended', () => {
      onPauseRef.current?.();
      onEndedRef.current?.();
    });

    player.on('userinactive', () => {
      player.userActive(true);
    });

    // Handle skip previous button click
    player.on('skipprevious', () => {
      const currentTime = player.currentTime() || 0;
      const wasPlaying = !player.paused();
      const now = Date.now();
      const timeSinceLastClick = now - lastPreviousClickRef.current;
      lastPreviousClickRef.current = now;

      // If within threshold from start OR clicked twice quickly, go to previous track
      if (currentTime < REWIND_THRESHOLD || timeSinceLastClick < DOUBLE_CLICK_THRESHOLD) {
        if (onPreviousTrackRef.current) {
          onPreviousTrackRef.current(wasPlaying);
        }
      } else {
        // Rewind to beginning
        player.currentTime(0);
        // If was playing, continue playing
        if (wasPlaying) {
          player.play();
        }
      }
    });

    // Handle skip next button click
    player.on('skipnext', () => {
      const wasPlaying = !player.paused();
      if (onNextTrackRef.current) {
        onNextTrackRef.current(wasPlaying);
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
    // We intentionally initialize the Video.js player only once on mount.
    // The event handlers registered here read from mutable refs (e.g. onNextTrackRef)
    // that are updated by other hooks, so they always see the latest callbacks
    // without needing to recreate the player when those refs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update source when audioSrc changes (without recreating player)
  useEffect(() => {
    if (playerRef.current && isInitializedRef.current) {
      const isInitialSource = audioSrc === initialSourceRef.current;
      playerRef.current.src({ src: audioSrc, type: 'audio/mp3' });
      playerRef.current.load();
      // Ensure controls remain visible after source change
      playerRef.current.addClass('vjs-has-started');
      playerRef.current.userActive(true);

      // Auto-play if enabled and this is not the initial source
      if (autoPlay && !isInitialSource) {
        playerRef.current.play();
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
  artistRelease,
  currentTrackId,
  onTrackSelect,
}: {
  artistRelease: { release: Release; artist: Artist };
  currentTrackId?: string;
  onTrackSelect?: (trackId: string) => void;
}) => {
  const { release } = artistRelease;
  const { releaseTracks } = release;

  // TODO: verify if this function is actually needed?
  /**
   * Format duration from seconds to MM:SS format
   */
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  /**
   * Get cover art for a release track, falling back to track coverArt or release coverArt
   */
  const getCoverArt = (releaseTrack: (typeof releaseTracks)[number]): string | null => {
    // First, check ReleaseTrack's coverArt (derived from uploaded file metadata)
    if ('coverArt' in releaseTrack && releaseTrack.coverArt) {
      return releaseTrack.coverArt as string;
    }
    // Fall back to the track's own coverArt
    if (releaseTrack.track.coverArt) {
      return releaseTrack.track.coverArt;
    }
    // Fall back to release coverArt
    return release.coverArt || null;
  };

  // Sort tracks by position
  const sortedTracks = [...releaseTracks].sort((a, b) => a.track.position - b.track.position);

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full flex items-center justify-center gap-2 text-sm text-zinc-600 hover:text-zinc-900"
        >
          <span>View all {releaseTracks.length} tracks</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Track List</DrawerTitle>
          <DrawerDescription>
            {release.title} • {releaseTracks.length} track{releaseTracks.length !== 1 ? 's' : ''}
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-4 max-h-[60vh] overflow-y-auto">
          <ol className="space-y-2">
            {sortedTracks.map((releaseTrack, index) => {
              const { track } = releaseTrack;
              const isCurrentTrack = currentTrackId === track.id;
              const coverArt = getCoverArt(releaseTrack);

              const trackItem = (
                <li
                  key={track.id}
                  className={`flex items-center justify-between gap-4 p-3 rounded-lg transition-colors ${
                    isCurrentTrack
                      ? 'bg-zinc-800 text-zinc-50'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                  } ${onTrackSelect ? 'cursor-pointer' : ''}`}
                  onClick={() => onTrackSelect?.(track.id)}
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
                          alt={track.title}
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
                      {track.title}
                    </span>
                  </div>
                  <span
                    className={`text-sm shrink-0 font-mono ${
                      isCurrentTrack ? 'text-zinc-50!' : 'text-zinc-500 dark:text-zinc-600'
                    }`}
                  >
                    {formatDuration(track.duration)}
                  </span>
                </li>
              );

              // Wrap with DrawerClose if onTrackSelect is provided to close drawer on selection
              return onTrackSelect ? (
                <DrawerClose key={track.id} asChild>
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
              {formatDuration(releaseTracks.reduce((total, rt) => total + rt.track.duration, 0))}
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
 *   { label: 'Download', onClick: () => {} }
 * ];
 *
 * <MediaPlayer>
 *   <MediaPlayer.DotNavMenu navMenuItems={menuItems} />
 * </MediaPlayer>
 * ```
 */
const DotNavMenu = ({ navMenuItems }: { navMenuItems: NavMenuItem[] }) => {
  return (
    <>
      {navMenuItems.length > 0 && (
        <div className="relative inline-block text-left">
          <div>
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
 * Union type of all valid MediaPlayer sub-components.
 *
 * @remarks
 * Used for type-checking compound component children
 */
type MediaPlayerComponent =
  | typeof Search
  | typeof CoverArtView
  | typeof InteractiveCoverArt
  | typeof CoverArtCarousel
  | typeof Controls
  | typeof Description
  | typeof DotNavMenu
  | typeof DotNavMenuItem
  | typeof DotNavMenuTrigger
  | typeof TrackListDrawer
  | typeof InfoTickerTape
  | typeof SocialSharer;

/**
 * Type definition for valid MediaPlayer children elements.
 *
 * @remarks
 * Ensures that only MediaPlayer sub-components can be used as children
 */
type MediaPlayerChildren = React.ReactElement<Record<string, never>, MediaPlayerComponent>;

/**
 * Props interface for the main MediaPlayer component.
 *
 * @property children - One or more MediaPlayer sub-components
 * @property artists - Optional array of artist objects (currently unused, reserved for future use)
 * @property className - Optional CSS class names to apply to the container
 */
interface MediaPlayerProps {
  children: MediaPlayerChildren | MediaPlayerChildren[];
  artists?: Artist[];
  className?: string;
}

/**
 * MediaPlayer is a compound component that provides a complete audio player interface.
 *
 * @param props - The component props
 * @param props.children - MediaPlayer sub-components to render
 *
 * @returns A container div wrapping all MediaPlayer sub-components
 *
 * @remarks
 * This is a compound component pattern implementation. Use the sub-components to build
 * a custom media player interface:
 * - MediaPlayer.Search - Search input for filtering content
 * - MediaPlayer.CoverArtView - Display album/release cover art
 * - MediaPlayer.InteractiveCoverArt - Cover art with play/pause overlay
 * - MediaPlayer.ThumbCarousel - Carousel of artist thumbnails
 * - MediaPlayer.InfoTickerTape - Scrolling track information display
 * - MediaPlayer.Controls - Audio playback controls with video.js
 * - MediaPlayer.TrackListDrawer - Collapsible track list
 * - MediaPlayer.Description - Release/track description (stub)
 * - MediaPlayer.DotNavMenu - Navigation menu with actions
 * - MediaPlayer.DotNavMenuItem - Individual menu item
 * - MediaPlayer.DotNavMenuTrigger - Menu trigger button
 * - MediaPlayer.SocialSharer - Social media sharing (stub)
 *
 * @example
 * ```tsx
 * <MediaPlayer>
 *   <MediaPlayer.Search control={form.control} />
 *   <MediaPlayer.CoverArtView
 *     artistRelease={{ release, artist }}
 *     width={380}
 *     height={380}
 *   />
 *   <MediaPlayer.InfoTickerTape
 *     artistRelease={{ release, artist }}
 *     trackName="Current Track"
 *   />
 *   <MediaPlayer.Controls
 *     audioSrc="/audio/track.mp3"
 *     onPreviousTrack={handlePrevious}
 *     onNextTrack={handleNext}
 *   />
 * </MediaPlayer>
 * ```
 */
export const MediaPlayer = ({ children, className }: MediaPlayerProps) => (
  <div className={className}>{children}</div>
);

MediaPlayer.Search = Search;
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
MediaPlayer.SocialSharer = SocialSharer;
