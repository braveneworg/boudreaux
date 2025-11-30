'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import Image from 'next/image';

import { ChevronDown, ChevronUp, EllipsisVertical, Search as SearchIcon } from 'lucide-react';
import videojs from 'video.js';

import { getArtistDisplayName } from '@/app/lib/utils/get-artist-display-name';
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
import type { Artist, Release } from '@/lib/types/media-models';

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

/**
 * Form values interface for the search component.
 *
 * @property search - The search query string
 */
export interface SearchFormValues {
  search: string;
}

/**
 * Props interface for the MediaControls component.
 *
 * @property audioSrc - The source URL for the audio file
 * @property onPreviousTrack - Optional callback function for previous track navigation
 * @property onNextTrack - Optional callback function for next track navigation
 */
interface MediaControlsProps {
  audioSrc: string;
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
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
        {numberUpSliced.map((artist) => (
          <CarouselItem key={artist.id}>
            <Image
              className="border-radius-[0.5rem]"
              src={artist.releases.sort((a, b) => b.releasedOn - a.releasedOn)[0].coverArt}
              alt={artist.name}
              width={84}
              height={84}
            />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
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
      alt={`${release.title} by ${artist.name}`}
      width={width}
      height={height}
      className="w-full aspect-square object-cover rounded-lg"
    />
  );
};

/**
 * InfoTickerTape component displays scrolling information about the currently playing track.
 *
 * @param props - The component props
 * @param props.artistRelease - An object containing a release and its associated artist
 * @param props.trackName - The name of the currently playing track
 *
 * @returns A ticker tape component with scrolling track information
 *
 * @remarks
 * - Displays artist/group name, release title, and track name
 * - Has a transparent background
 * - Uses CSS animation for the scrolling effect
 *
 * @example
 * ```tsx
 * <MediaPlayer>
 *   <MediaPlayer.InfoTickerTape
 *     artistRelease={{ release, artist }}
 *     trackName="Song Title"
 *   />
 * </MediaPlayer>
 * ```
 */
const InfoTickerTape = ({
  artistRelease,
  trackName,
}: {
  artistRelease: { release: Release; artist: Artist };
  trackName: string;
}) => {
  const { release, artist } = artistRelease;
  const { releaseTracks } = artistRelease.release;

  return (
    <>
      <div className="w-full overflow-hidden bg-transparent py-2 border-t border-top-zinc-200 border-top-radius-[0.5rem]">
        <div className="animate-marquee whitespace-nowrap inline-block">
          <span className="text-sm font-medium text-zinc-900">
            {getArtistDisplayName(artist)} • {release.title} • {trackName}
          </span>
        </div>
      </div>
      {releaseTracks.length > 1 && (
        <MediaPlayer.TrackListDrawer artistRelease={artistRelease} currentTrackId={trackName} />
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
const Controls = ({ audioSrc, onPreviousTrack, onNextTrack }: MediaControlsProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<Player | null>(null);
  const SKIP_TIME = 10; // seconds for rewind/fast-forward

  useEffect(() => {
    if (!audioRef.current) return;

    playerRef.current = videojs(audioRef.current, {
      controls: true,
      autoplay: false,
      preload: 'auto',
      responsive: true,
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
          inline: false, // Show volume slider inline
          vertical: false, // Horizontal orientation
        },
      },
    });

    playerRef.current.ready(() => {
      if (playerRef.current) {
        playerRef.current.addClass('vjs-audio');
      }
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [audioSrc, onPreviousTrack, onNextTrack]);

  // Register components
  videojs.registerComponent('AudioRewindButton', AudioRewindButton);
  videojs.registerComponent('AudioFastForwardButton', AudioFastForwardButton);
  videojs.registerComponent('SkipPreviousButton', SkipPreviousButton);
  videojs.registerComponent('SkipNextButton', SkipNextButton);

  return (
    <>
      {/* Audio Player - Full Width on Mobile, Controls Always Visible */}
      <div className="p-4 sm:p-6 pt-4">
        <div className="audio-player-wrapper">
          <audio
            ref={audioRef}
            className="video-js vjs-default-skin vjs-audio vjs-has-started w-full"
          />
        </div>
      </div>
    </>
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
  artistRelease,
  currentTrackId,
  onTrackSelect,
  children,
}: {
  artistRelease: { release: Release; artist: Artist };
  currentTrackId?: string;
  onTrackSelect?: (trackId: string) => void;
}) => {
  const { artist, release } = artistRelease;
  const { releaseTracks } = artistRelease.release;

  // TODO: verify if this function is actually needed?
  /**
   * Format duration from seconds to MM:SS format
   */
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Sort tracks by position
  const sortedTracks = [...releaseTracks].sort((a, b) => a.track.position - b.track.position);

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full flex items-center justify-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
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

              return (
                <li
                  key={track.id}
                  className={`flex items-center justify-between gap-4 p-3 rounded-lg transition-colors ${
                    isCurrentTrack
                      ? 'bg-zinc-100 dark:bg-zinc-800'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                  } ${onTrackSelect ? 'cursor-pointer' : ''}`}
                  onClick={() => onTrackSelect?.(track.id)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span
                      className={`text-sm font-medium ${
                        isCurrentTrack
                          ? 'text-zinc-900 dark:text-zinc-100'
                          : 'text-zinc-500 dark:text-zinc-400'
                      } w-6 shrink-0 text-right`}
                    >
                      {index + 1}.
                    </span>
                    <span
                      className={`text-sm ${
                        isCurrentTrack
                          ? 'font-semibold text-zinc-900 dark:text-zinc-100'
                          : 'text-zinc-700 dark:text-zinc-300'
                      } truncate`}
                    >
                      {track.title}
                    </span>
                  </div>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400 shrink-0 font-mono">
                    {formatDuration(track.duration)}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <DrawerClose asChild>
          <Button variant="outline" className="mx-4 mb-4">
            <ChevronUp className="h-4 w-4 mr-2" />
            Close
          </Button>
        </DrawerClose>
        <MediaPlayer.Description
          description={artist.featuredOn ? artist.featuredDescription : release.description}
        />
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
  | typeof Controls
  | typeof CoverArtCarousel
  | typeof Description
  | typeof DotNavMenu
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
 */
interface MediaPlayerProps {
  children: MediaPlayerChildren | MediaPlayerChildren[];
  artists?: Artist[];
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
export const MediaPlayer = ({ children }: MediaPlayerProps) => <div>{children}</div>;

MediaPlayer.Search = Search;
MediaPlayer.CoverArtView = CoverArtView;
MediaPlayer.InfoTickerTape = InfoTickerTape;
MediaPlayer.Controls = Controls;
MediaPlayer.CoverArtCarousel = CoverArtCarousel;
// MediaPlayer.Description = Description;
// MediaPlayer.DotNavMenu = DotNavMenu;
// MediaPlayer.DotNavMenuItem = DotNavMenuItem;
// MediaPlayer.DotNavMenuTrigger = DotNavMenuTrigger;
MediaPlayer.TrackListDrawer = TrackListDrawer;
// MediaPlayer.SocialSharer = SocialSharer;
