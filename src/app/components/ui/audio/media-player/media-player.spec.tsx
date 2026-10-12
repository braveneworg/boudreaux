/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { act, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import videojs from 'video.js';

import type { Release, Artist } from '@/lib/types/media-models';

import { MediaPlayer } from './media-player';
import { claimPlayback, releasePlayback } from '../../playback-session';

import type * as PlaybackSession from '../../playback-session';

// Hoisted state for video.js mock (vi.mock factories are hoisted, so they
// cannot reference spec-module-scope let/const directly; use vi.hoisted).
const playerVolumeState = vi.hoisted(() => ({ volume: 1, muted: false }));

// Mock video.js - factory function must not use variables defined outside.
// One player per videojs() call (matching real video.js), each closing over
// its element so dispose() is DOM-faithful: real video.js adopts the
// data-vjs-player parent as the player root and dispose() removes THAT parent
// from the DOM — an inert fake dispose hides remount-after-dispose bugs.
vi.mock('video.js', () => {
  const makePlayer = (el?: HTMLElement) => {
    // Real handler registry so production code can re-fire events through
    // `trigger` (the adopted-element sync path) and reach handlers that specs
    // still also inspect via `player.on.mock.calls`.
    const handlers = new Map<string, Array<() => void>>();
    return {
      addClass: vi.fn(),
      removeClass: vi.fn(),
      ready: vi.fn((callback: () => void) => callback()),
      on: vi.fn((event: string, callback: () => void) => {
        handlers.set(event, [...(handlers.get(event) ?? []), callback]);
      }),
      off: vi.fn(),
      trigger: vi.fn((event: string) => {
        for (const callback of handlers.get(event) ?? []) callback();
      }),
      currentTime: vi.fn().mockReturnValue(0),
      paused: vi.fn().mockReturnValue(true),
      play: vi.fn(),
      pause: vi.fn(),
      src: vi.fn(),
      load: vi.fn(),
      dispose: vi.fn(() => el?.closest('[data-vjs-player]')?.remove()),
      userActive: vi.fn(),
      error: vi.fn().mockReturnValue(null),
      el: vi.fn().mockReturnValue(document.createElement('div')),
      volume: vi.fn((value?: number) => {
        if (value !== undefined) {
          playerVolumeState.volume = value;
          return undefined;
        }
        return playerVolumeState.volume;
      }),
      muted: vi.fn((value?: boolean) => {
        if (value !== undefined) {
          playerVolumeState.muted = value;
          return undefined;
        }
        return playerVolumeState.muted;
      }),
    };
  };

  const componentRegistry = new Map<string, unknown>([['Button', () => null]]);

  const mockVideojs = Object.assign(
    vi.fn((el?: HTMLElement) => makePlayer(el)),
    {
      registerComponent: vi.fn((name: string, component: unknown) => {
        componentRegistry.set(name, component);
      }),
      getComponent: vi.fn((name: string) => componentRegistry.get(name) ?? null),
    }
  );

  return { default: mockVideojs };
});

// Spy on the real playback session rather than replacing it: the tests below
// assert both its observable effect (a rival claimant is paused) and the
// claim/release id symmetry, which needs the genuine singleton underneath.
vi.mock('../../playback-session', async (importOriginal) => {
  const actual = await importOriginal<typeof PlaybackSession>();
  return {
    claimPlayback: vi.fn(actual.claimPlayback),
    releasePlayback: vi.fn(actual.releasePlayback),
  };
});

// Mock LazyControls to avoid async/dynamic behavior in tests.
// Instead of loading the lazily wrapped controls module, this mock imports
// ./media-player-controls directly and returns the real Controls component
// so the test can render it synchronously with the mocked video.js instance.
vi.mock('./lazy-controls', async () => {
  const controls = await import('./media-player-controls');
  return { LazyControls: controls.Controls };
});

// Mock the audio controls
vi.mock('../audio-controls', () => ({
  AudioRewindButton: vi.fn(),
  AudioFastForwardButton: vi.fn(),
  SkipPreviousButton: vi.fn(),
  SkipNextButton: vi.fn(),
  getAudioRewindButton: vi.fn(
    () =>
      function MockAudioRewindButton() {
        return null;
      }
  ),
  getAudioFastForwardButton: vi.fn(
    () =>
      function MockAudioFastForwardButton() {
        return null;
      }
  ),
  getSkipPreviousButton: vi.fn(
    () =>
      function MockSkipPreviousButton() {
        return null;
      }
  ),
  getSkipNextButton: vi.fn(
    () =>
      function MockSkipNextButton() {
        return null;
      }
  ),
  resetClasses: vi.fn(),
}));

// Mock Drawer components from shadcn/ui
vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drawer">{children}</div>
  ),
  DrawerTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => (
    <div data-testid="drawer-trigger" data-as-child={asChild}>
      {children}
    </div>
  ),
  DrawerContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drawer-content">{children}</div>
  ),
  DrawerHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drawer-header">{children}</div>
  ),
  DrawerTitle: ({ children }: { children: React.ReactNode }) => (
    <h2 data-testid="drawer-title">{children}</h2>
  ),
  DrawerDescription: ({ children }: { children: React.ReactNode }) => (
    <p data-testid="drawer-description">{children}</p>
  ),
  DrawerClose: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => (
    <div data-testid="drawer-close" data-as-child={asChild}>
      {children}
    </div>
  ),
}));

// Mock Carousel components
vi.mock('@/components/ui/carousel', () => ({
  Carousel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="carousel">{children}</div>
  ),
  CarouselContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="carousel-content" className={className}>
      {children}
    </div>
  ),
  CarouselItem: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="carousel-item" className={className}>
      {children}
    </div>
  ),
  CarouselPrevious: () => <button data-testid="carousel-previous">Previous</button>,
  CarouselNext: () => <button data-testid="carousel-next">Next</button>,
}));

// Mock next/image — forwards the delivery-relevant props (sizes/unoptimized)
// so specs can assert which variant strategy each image uses.
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    className,
    sizes,
    unoptimized,
  }: {
    src: string;
    alt: string;
    className?: string;
    sizes?: string;
    unoptimized?: boolean;
  }) =>
    React.createElement('img', {
      src,
      alt,
      className,
      sizes,
      'data-testid': 'next-image',
      'data-unoptimized': unoptimized ? 'true' : undefined,
    }),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ChevronDown: () => <span data-testid="chevron-down-icon" />,
  ChevronUp: () => <span data-testid="chevron-up-icon" />,
  EllipsisVertical: () => <span data-testid="ellipsis-vertical-icon" />,
  Eye: ({ className }: { className?: string }) => (
    <span data-testid="eye-icon" className={className} />
  ),
  Pause: ({ className }: { className?: string }) => (
    <span data-testid="pause-icon" className={className} />
  ),
  Play: ({ className }: { className?: string }) => (
    <span data-testid="play-icon" className={className} />
  ),
  Search: () => <span data-testid="search-icon" />,
  Star: ({ className, 'aria-label': ariaLabel }: { className?: string; 'aria-label'?: string }) => (
    <span data-testid="star-icon" className={className} aria-label={ariaLabel} />
  ),
}));

// Mock Button from shadcn/ui. Spreads `...rest` onto the DOM button (mirroring
// the real Button's `{...props}`) so an `aria-label` — and the props Radix
// injects when the Button is a `PopoverTrigger asChild` (onClick, aria-expanded)
// — reach the rendered element and drive the real Popover.
vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    variant,
    size,
    className,
    ...rest
  }: {
    children: React.ReactNode;
    variant?: string;
    size?: string;
    className?: string;
  } & React.ComponentProps<'button'>) => (
    <button
      data-testid="button"
      data-variant={variant}
      data-size={size}
      className={className}
      {...rest}
    >
      {children}
    </button>
  ),
}));

// Mock DownloadDialog is no longer needed - download dialog lives at consumer level

// Test data factory helpers using type assertions to unknown first
const createMockFormatFile = (
  overrides: Partial<{
    id: string;
    trackNumber: number;
    title: string | null;
    fileName: string;
    duration: number | null;
    s3Key: string;
  }> = {}
) => ({
  id: overrides.id ?? 'file-1',
  formatId: 'format-1',
  trackNumber: overrides.trackNumber ?? 1,
  title: overrides.title !== undefined ? overrides.title : 'Test Track',
  fileName: overrides.fileName ?? 'test-track.mp3',
  duration: overrides.duration !== undefined ? overrides.duration : 180,
  s3Key: overrides.s3Key ?? 'releases/test/test-track.mp3',
  fileSize: BigInt(1024),
  mimeType: 'audio/mpeg',
  checksum: null,
  uploadedAt: new Date('2024-01-01'),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
});

const createMockRelease = (
  files: ReturnType<typeof createMockFormatFile>[],
  overrides: Partial<{
    id: string;
    title: string;
    coverArt: string | null;
  }> = {}
): Release =>
  ({
    id: overrides.id ?? 'release-1',
    title: overrides.title ?? 'Test Album',
    coverArt: overrides.coverArt ?? 'https://example.com/cover.jpg',
    digitalFormats: [{ id: 'format-1', formatType: 'MP3_320KBPS', files }],
    images: [],
    artistReleases: [],
    releaseUrls: [],
  }) as unknown as Release;

const createMockArtist = (
  overrides: Partial<{
    firstName: string;
    surname: string;
    displayName: string | null;
  }> = {}
): Artist =>
  ({
    id: 'artist-1',
    firstName: overrides.firstName ?? 'Test',
    surname: overrides.surname ?? 'Artist',
    displayName: overrides.displayName ?? null,
    images: [],
    labels: [],
    releases: [],
    urls: [],
  }) as unknown as Artist;

describe('MediaPlayer', () => {
  beforeEach(() => {
    playerVolumeState.volume = 1;
    playerVolumeState.muted = false;
  });

  describe('MediaPlayer container', () => {
    it('should render children', () => {
      render(
        <MediaPlayer>
          <div data-testid="child">Child content</div>
        </MediaPlayer>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <MediaPlayer className="custom-class">
          <div>Child</div>
        </MediaPlayer>
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  /**
   * The audio player and every VideoPlayer share one playback session, so
   * starting either medium pauses the other. Before this, only videos claimed
   * the session: starting a video left a playing release player audible
   * underneath it.
   */
  describe('shared playback session', () => {
    /**
     * The video.js mock builds one player per call, so grab the most recent
     * instance and its most recently registered handler — they belong to the
     * player just rendered, whatever ran before.
     */
    const getPlayHandler = (): (() => void) => {
      const player = vi.mocked(videojs).mock.results.at(-1)?.value as {
        on: ReturnType<typeof vi.fn>;
      };
      const call = player.on.mock.calls.filter(([event]) => event === 'play').at(-1);
      if (!call) throw new Error('no play handler registered');
      return call[1] as () => void;
    };

    it('pauses a playing video when the audio player starts', () => {
      const pauseVideo = vi.fn();
      claimPlayback('a-video', pauseVideo);

      render(
        <MediaPlayer>
          <MediaPlayer.Controls audioSrc="https://example.com/audio.mp3" />
        </MediaPlayer>
      );
      act(() => getPlayHandler()());

      expect(pauseVideo).toHaveBeenCalledTimes(1);
    });

    it('releases the same id it claimed when it unmounts', () => {
      vi.mocked(claimPlayback).mockClear();
      vi.mocked(releasePlayback).mockClear();

      const { unmount } = render(
        <MediaPlayer>
          <MediaPlayer.Controls audioSrc="https://example.com/audio.mp3" />
        </MediaPlayer>
      );
      act(() => getPlayHandler()());
      const claimedId = vi.mocked(claimPlayback).mock.calls.at(-1)?.[0];
      unmount();

      // Asymmetry here would strand a disposed player as the session's
      // claimant, so the next player would "pause" something already gone.
      expect(vi.mocked(releasePlayback)).toHaveBeenCalledWith(claimedId);
    });

    /**
     * Regression: the init effect used to `return` bare after a successful
     * immediate init, which is the common path — so the disposing cleanup was
     * unreachable and every audio player leaked its Video.js instance and
     * listeners on unmount.
     */
    it('disposes the player when it unmounts', () => {
      const { unmount } = render(
        <MediaPlayer>
          <MediaPlayer.Controls audioSrc="https://example.com/audio.mp3" />
        </MediaPlayer>
      );
      const player = vi.mocked(videojs).mock.results.at(-1)?.value as {
        dispose: ReturnType<typeof vi.fn>;
      };
      player.dispose.mockClear();
      unmount();

      expect(player.dispose).toHaveBeenCalledTimes(1);
    });

    // Real video.js adopts the data-vjs-player parent as the player root and
    // dispose() removes it from the DOM, so that parent must be created fresh
    // per init. With it rendered by React, StrictMode's dev double-mount left
    // the second player initializing into a detached tree — an invisible
    // player, and the local-dev failure behind player-volume-persistence.
    it('keeps the player element attached under StrictMode double-mount', () => {
      render(
        <React.StrictMode>
          <MediaPlayer>
            <MediaPlayer.Controls audioSrc="https://example.com/audio.mp3" />
          </MediaPlayer>
        </React.StrictMode>
      );

      const el = vi.mocked(videojs).mock.calls.at(-1)?.[0] as HTMLElement;
      expect(el.isConnected).toBe(true);
    });
  });

  describe('Controls component', () => {
    it('should render the container div', () => {
      const { container } = render(
        <MediaPlayer>
          <MediaPlayer.Controls audioSrc="https://example.com/audio.mp3" />
        </MediaPlayer>
      );

      const controlsWrapper = container.querySelector('.audio-player-wrapper');
      expect(controlsWrapper).toBeInTheDocument();
      // The data-vjs-player container is created by the initializer INSIDE
      // the React host (dispose removes it, so React must not render it).
      expect(controlsWrapper?.querySelector('[data-vjs-player]')).toBeInTheDocument();
    });

    it('should suppress transient corruption/decode errors', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.Controls audioSrc="https://example.com/audio.mp3" />
        </MediaPlayer>
      );

      const player = vi.mocked(videojs).mock.results.at(-1)?.value as {
        on: ReturnType<typeof vi.fn>;
        error: ReturnType<typeof vi.fn>;
        removeClass: ReturnType<typeof vi.fn>;
        el: ReturnType<typeof vi.fn>;
        load: ReturnType<typeof vi.fn>;
      };

      const playerEl = document.createElement('div');
      const errorDisplay = document.createElement('div');
      errorDisplay.className = 'vjs-error-display';
      playerEl.appendChild(errorDisplay);
      player.el.mockReturnValue(playerEl);
      player.error.mockReturnValue({
        code: 3,
        message:
          'The media playback was aborted due to a corruption problem or because the media used features your browser did not support.',
      });

      const errorHandler = player.on.mock.calls.find(
        ([eventName]) => eventName === 'error'
      )?.[1] as (() => void) | undefined;
      expect(errorHandler).toBeDefined();
      player.load.mockClear();

      errorHandler?.();

      expect(player.error).toHaveBeenCalledWith(null);
      expect(player.removeClass).toHaveBeenCalledWith('vjs-error');
      expect(errorDisplay).toHaveClass('vjs-hidden');
      expect(errorDisplay).toHaveAttribute('aria-hidden', 'true');
      expect(player.load).toHaveBeenCalled();
    });

    it('should not suppress non-transient media errors', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.Controls audioSrc="https://example.com/audio.mp3" />
        </MediaPlayer>
      );

      const player = vi.mocked(videojs).mock.results.at(-1)?.value as {
        on: ReturnType<typeof vi.fn>;
        error: ReturnType<typeof vi.fn>;
        load: ReturnType<typeof vi.fn>;
      };

      player.error.mockReset();
      player.load.mockClear();
      player.error.mockReturnValue({
        code: 4,
        message: 'A fatal unsupported media type error occurred.',
      });

      const errorHandler = player.on.mock.calls.find(
        ([eventName]) => eventName === 'error'
      )?.[1] as (() => void) | undefined;
      expect(errorHandler).toBeDefined();

      errorHandler?.();

      expect(player.error).not.toHaveBeenCalledWith(null);
      expect(player.load).not.toHaveBeenCalled();
    });
  });

  describe('Controls gesture-primed element adoption', () => {
    const PRIMED_SRC = 'https://cdn.example.com/releases/r1/tracks/01.mp3';
    const NEXT_SRC = 'https://cdn.example.com/releases/r1/tracks/02.mp3';

    /** Build the playing element the audio priming hook would hand off. */
    const makePlayingAudioEl = (): HTMLAudioElement => {
      const el = document.createElement('audio');
      el.src = PRIMED_SRC;
      void el.play()?.catch(() => {});
      return el;
    };

    it('adopts the gesture-primed element into the player container', () => {
      const primedEl = makePlayingAudioEl();
      const { container } = render(
        <MediaPlayer>
          <MediaPlayer.Controls audioSrc={PRIMED_SRC} takeMediaEl={() => primedEl} />
        </MediaPlayer>
      );

      expect(container.querySelector('[data-vjs-player]')?.contains(primedEl)).toBe(true);
      expect(vi.mocked(videojs)).toHaveBeenLastCalledWith(primedEl, expect.any(Object));
    });

    it('skips the initial sources option for a pre-sourced adopted element', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.Controls audioSrc={PRIMED_SRC} takeMediaEl={() => makePlayingAudioEl()} />
        </MediaPlayer>
      );

      // Re-setting the same source reruns the media load algorithm and kills
      // the gesture-started playback.
      const options = vi.mocked(videojs).mock.calls.at(-1)?.[1] as Record<string, unknown>;
      expect(options).not.toHaveProperty('sources');
    });

    it('does not re-set the source on mount after adopting a pre-sourced element', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.Controls audioSrc={PRIMED_SRC} takeMediaEl={() => makePlayingAudioEl()} />
        </MediaPlayer>
      );

      const player = vi.mocked(videojs).mock.results.at(-1)?.value as {
        src: ReturnType<typeof vi.fn>;
      };
      expect(player.src).not.toHaveBeenCalled();
    });

    it('claims the session and notifies onPlay for an adopted playing element', () => {
      const onPlay = vi.fn();
      render(
        <MediaPlayer>
          <MediaPlayer.Controls
            audioSrc={PRIMED_SRC}
            takeMediaEl={() => makePlayingAudioEl()}
            onPlay={onPlay}
          />
        </MediaPlayer>
      );

      expect(vi.mocked(claimPlayback)).toHaveBeenCalled();
      expect(onPlay).toHaveBeenCalled();
    });

    it('marks the adopted playing element as playing in the player skin', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.Controls audioSrc={PRIMED_SRC} takeMediaEl={() => makePlayingAudioEl()} />
        </MediaPlayer>
      );

      const player = vi.mocked(videojs).mock.results.at(-1)?.value as {
        addClass: ReturnType<typeof vi.fn>;
      };
      expect(player.addClass).toHaveBeenCalledWith('vjs-playing');
    });

    it('falls back to a self-created element when the primed element was already taken', () => {
      const { container } = render(
        <MediaPlayer>
          <MediaPlayer.Controls audioSrc={PRIMED_SRC} takeMediaEl={() => null} />
        </MediaPlayer>
      );

      const options = vi.mocked(videojs).mock.calls.at(-1)?.[1] as Record<string, unknown>;
      expect(container.querySelector('[data-vjs-player] audio')).toBeInTheDocument();
      expect(options).toHaveProperty('sources');
    });

    it('switches sources normally after the adopted initial source', () => {
      const primedEl = makePlayingAudioEl();
      const { rerender } = render(
        <MediaPlayer>
          <MediaPlayer.Controls audioSrc={PRIMED_SRC} takeMediaEl={() => primedEl} />
        </MediaPlayer>
      );
      const player = vi.mocked(videojs).mock.results.at(-1)?.value as {
        src: ReturnType<typeof vi.fn>;
      };

      rerender(
        <MediaPlayer>
          <MediaPlayer.Controls audioSrc={NEXT_SRC} takeMediaEl={() => null} />
        </MediaPlayer>
      );

      expect(player.src).toHaveBeenCalledWith({ src: NEXT_SRC, type: 'audio/mpeg' });
    });
  });

  describe('InfoTickerTape component', () => {
    const renderTicker = (isPlaying?: boolean) =>
      render(
        <MediaPlayer>
          <MediaPlayer.InfoTickerTape
            artistRelease={{
              release: createMockRelease([createMockFormatFile()], { title: 'My Album' }),
              artist: createMockArtist({ displayName: 'Test Artist' }),
            }}
            trackName="My Song"
            isPlaying={isPlaying}
          />
        </MediaPlayer>
      );

    it('should render the track name, artist display name and release title', () => {
      renderTicker();

      expect(screen.getByText('My Song • by Test Artist • My Album')).toBeInTheDocument();
    });

    it('should use text-xs font class for ticker text', () => {
      const { container } = renderTicker();

      expect(container.querySelector('.text-xs')).toBeInTheDocument();
    });

    it('should apply marquee animation when isPlaying is true', () => {
      const { container } = renderTicker(true);

      expect(container.querySelector('.animate-marquee')).toBeInTheDocument();
    });

    it('should center text when isPlaying is false', () => {
      const { container } = renderTicker(false);

      expect(container.querySelector('.text-center')).toBeInTheDocument();
    });

    it('should render a square ticker without a rounded bottom edge', () => {
      const { container } = renderTicker();

      const ticker = container.querySelector('.bg-zinc-800');
      expect(ticker).toBeInTheDocument();
      expect(ticker).not.toHaveClass('rounded-b-lg');
    });

    it('should render overflow wrapper with horizontal margin', () => {
      const { container } = renderTicker();

      expect(container.querySelector('.overflow-hidden.mx-3')).toBeInTheDocument();
    });

    it('should not render TrackListDrawer inside InfoTickerTape', () => {
      renderTicker();

      expect(screen.queryByTestId('drawer')).not.toBeInTheDocument();
    });
  });

  describe('TrackListDrawer component', () => {
    const file1 = createMockFormatFile({
      id: 'file-1',
      trackNumber: 1,
      title: 'First Song',
      duration: 180,
    });
    const file2 = createMockFormatFile({
      id: 'file-2',
      trackNumber: 2,
      title: 'Second Song',
      duration: 200,
    });
    const file3 = createMockFormatFile({
      id: 'file-3',
      trackNumber: 3,
      title: 'Third Song',
      duration: 220,
    });
    const mockRelease = createMockRelease([file1, file2, file3], { title: 'Test Album' });
    const mockArtist = createMockArtist({ displayName: 'Test Artist' });

    it('should render track count in trigger button', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistName="Test Artist"
            artistRelease={{ release: mockRelease, artist: mockArtist }}
          />
        </MediaPlayer>
      );

      expect(screen.getByText('View all 3 tracks')).toBeInTheDocument();
    });

    it('should render all tracks sorted by position', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistName="Test Artist"
            artistRelease={{ release: mockRelease, artist: mockArtist }}
          />
        </MediaPlayer>
      );

      expect(screen.getByText('First Song')).toBeInTheDocument();
      expect(screen.getByText('Second Song')).toBeInTheDocument();
      expect(screen.getByText('Third Song')).toBeInTheDocument();
    });

    it('should fetch the smallest variant for the 40px row thumbnails', () => {
      // CDN-origin fixture: buildCdnImageVariantUrl only rewrites CDN/relative
      // sources (external domains pass through untouched).
      const cdnRelease = createMockRelease([file1], {
        title: 'CDN Album',
        coverArt: 'https://cdn.fakefourrecords.com/media/releases/abc/cover.jpg',
      });

      render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistName="Test Artist"
            artistRelease={{ release: cdnRelease, artist: mockArtist }}
          />
        </MediaPlayer>
      );

      // Rows render h-10 w-10 (40px) thumbs — the 256 variant is the smallest
      // generated width; 384 shipped ~2× the pixels for the same box.
      const rowThumbs = screen
        .getAllByTestId('next-image')
        .filter((img) => img.getAttribute('src')?.includes('cover_w'));
      expect(rowThumbs.length).toBeGreaterThan(0);
      rowThumbs.forEach((img) => {
        expect(img).toHaveAttribute(
          'src',
          'https://cdn.fakefourrecords.com/media/releases/abc/cover_w256.webp'
        );
      });
    });

    it('should display track numbers correctly', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistName="Test Artist"
            artistRelease={{ release: mockRelease, artist: mockArtist }}
          />
        </MediaPlayer>
      );

      expect(screen.getByText('1.')).toBeInTheDocument();
      expect(screen.getByText('2.')).toBeInTheDocument();
      expect(screen.getByText('3.')).toBeInTheDocument();
    });

    it('should format track duration correctly', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistName="Test Artist"
            artistRelease={{ release: mockRelease, artist: mockArtist }}
          />
        </MediaPlayer>
      );

      // 180 seconds = 3:00, 200 seconds = 3:20, 220 seconds = 3:40
      expect(screen.getByText('3:00')).toBeInTheDocument();
      expect(screen.getByText('3:20')).toBeInTheDocument();
      expect(screen.getByText('3:40')).toBeInTheDocument();
    });

    it('should calculate and display total time', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistName="Test Artist"
            artistRelease={{ release: mockRelease, artist: mockArtist }}
          />
        </MediaPlayer>
      );

      // Total: 180 + 200 + 220 = 600 seconds = 10:00
      expect(screen.getByText('10:00')).toBeInTheDocument();
      expect(screen.getByText('Total time')).toBeInTheDocument();
    });

    it('should call onTrackSelect when a track is clicked', () => {
      const onTrackSelect = vi.fn();

      render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistName="Test Artist"
            artistRelease={{ release: mockRelease, artist: mockArtist }}
            onTrackSelect={onTrackSelect}
          />
        </MediaPlayer>
      );

      fireEvent.click(screen.getByText('Second Song'));

      expect(onTrackSelect).toHaveBeenCalledWith('file-2');
    });

    it('should wrap track items in DrawerClose when onTrackSelect is provided', () => {
      const onTrackSelect = vi.fn();

      render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistName="Test Artist"
            artistRelease={{ release: mockRelease, artist: mockArtist }}
            onTrackSelect={onTrackSelect}
          />
        </MediaPlayer>
      );

      // Should have DrawerClose elements wrapping each track
      const drawerCloseElements = screen.getAllByTestId('drawer-close');
      // 3 tracks + 1 close button = 4 DrawerClose elements
      expect(drawerCloseElements.length).toBeGreaterThanOrEqual(3);
    });

    it('should display album title in drawer description', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistName="Test Artist"
            artistRelease={{ release: mockRelease, artist: mockArtist }}
          />
        </MediaPlayer>
      );

      expect(screen.getByTestId('drawer-description')).toHaveTextContent('Test Album');
    });

    it('should highlight current track', () => {
      const { container } = render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistName="Test Artist"
            artistRelease={{ release: mockRelease, artist: mockArtist }}
            currentTrackId="file-2"
          />
        </MediaPlayer>
      );

      // The current track should have the highlight class
      const highlightedItem = container.querySelector('.bg-zinc-800');
      expect(highlightedItem).toBeInTheDocument();
    });

    it('should display release cover art for each track', () => {
      const fileWithReleaseCoverArt = createMockFormatFile({
        id: 'file-cover',
        trackNumber: 1,
        title: 'Track With Cover',
        duration: 180,
      });
      const releaseWithCoverArt = createMockRelease([fileWithReleaseCoverArt], {
        title: 'Album With Covers',
        coverArt: 'https://example.com/album-cover.jpg',
      });

      render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistName="Test Artist"
            artistRelease={{ release: releaseWithCoverArt, artist: mockArtist }}
          />
        </MediaPlayer>
      );

      // Should render the release's cover art image for the track
      const coverArtImages = screen.getAllByTestId('next-image');
      expect(coverArtImages.length).toBeGreaterThan(0);
      expect(coverArtImages[0]).toHaveAttribute('src', 'https://example.com/album-cover.jpg');
    });
  });

  describe('Description component', () => {
    it('should render description text', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.Description description="This is a test description" />
        </MediaPlayer>
      );

      expect(screen.getByText('This is a test description')).toBeInTheDocument();
    });
  });

  describe('InteractiveCoverArt component', () => {
    const defaultProps = {
      src: 'https://example.com/cover.jpg',
      alt: 'Test Album cover art',
      isPlaying: false,
      onTogglePlay: vi.fn(),
    };

    beforeEach(() => {
      defaultProps.onTogglePlay = vi.fn();
    });

    it('should render the cover art image', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.InteractiveCoverArt {...defaultProps} />
        </MediaPlayer>
      );

      const img = screen.getByTestId('next-image');
      expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg');
      expect(img).toHaveAttribute('alt', 'Test Album cover art');
    });

    it('should call onTogglePlay when the cover art button is clicked', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.InteractiveCoverArt {...defaultProps} />
        </MediaPlayer>
      );

      const playButton = screen.getByRole('button', { name: 'Play' });
      fireEvent.click(playButton);

      expect(defaultProps.onTogglePlay).toHaveBeenCalledTimes(1);
    });

    it('should show Play aria-label when not playing', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.InteractiveCoverArt {...defaultProps} isPlaying={false} />
        </MediaPlayer>
      );

      expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    });

    it('should show Pause aria-label when playing', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.InteractiveCoverArt {...defaultProps} isPlaying />
        </MediaPlayer>
      );

      expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    });

    it('should render a square play badge without rounded corners', () => {
      const { container } = render(
        <MediaPlayer>
          <MediaPlayer.InteractiveCoverArt {...defaultProps} />
        </MediaPlayer>
      );

      const badge = container.querySelector('.backdrop-blur-sm');
      expect(badge).toBeInTheDocument();
      expect(badge).not.toHaveClass('rounded-full');
    });
  });

  describe('FormatFileListDrawer featured track indicator', () => {
    const trackFiles = [
      createMockFormatFile({ id: 'f-1', trackNumber: 1, title: 'Track One' }),
      createMockFormatFile({ id: 'f-2', trackNumber: 2, title: 'Track Two' }),
      createMockFormatFile({ id: 'f-3', trackNumber: 3, title: 'Track Three' }),
    ];

    it('should render a star icon for the featured track', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.FormatFileListDrawer
            files={trackFiles}
            currentFileId={null}
            artistName="Test Artist"
            releaseTitle="Test Album"
            featuredTrackNumber={2}
          />
        </MediaPlayer>
      );

      const starIcons = screen.getAllByTestId('star-icon');
      expect(starIcons).toHaveLength(1);
      expect(starIcons[0]).toHaveAttribute('aria-label', 'Featured track');
    });

    it('should not render a star icon when no featured track is set', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.FormatFileListDrawer
            files={trackFiles}
            currentFileId={null}
            artistName="Test Artist"
            releaseTitle="Test Album"
          />
        </MediaPlayer>
      );

      expect(screen.queryByTestId('star-icon')).not.toBeInTheDocument();
    });

    it('should not render a star icon when featuredTrackNumber does not match any file', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.FormatFileListDrawer
            files={trackFiles}
            currentFileId={null}
            artistName="Test Artist"
            releaseTitle="Test Album"
            featuredTrackNumber={99}
          />
        </MediaPlayer>
      );

      expect(screen.queryByTestId('star-icon')).not.toBeInTheDocument();
    });
  });

  describe('DotNavMenu component', () => {
    it('should render a trigger button labelled by the label prop', () => {
      render(
        <MediaPlayer.DotNavMenu label="Add to a playlist">
          <div>panel body</div>
        </MediaPlayer.DotNavMenu>
      );

      expect(screen.getByRole('button', { name: 'Add to a playlist' })).toBeInTheDocument();
    });

    it('should default the trigger label to "Add to a playlist"', () => {
      render(
        <MediaPlayer.DotNavMenu>
          <div>panel body</div>
        </MediaPlayer.DotNavMenu>
      );

      expect(screen.getByRole('button', { name: 'Add to a playlist' })).toBeInTheDocument();
    });

    it('should reveal the portaled popover content when the trigger is clicked', async () => {
      const user = userEvent.setup();

      render(
        <MediaPlayer.DotNavMenu label="Add to a playlist">
          <div>panel body</div>
        </MediaPlayer.DotNavMenu>
      );

      expect(screen.queryByText('panel body')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Add to a playlist' }));

      // PopoverContent renders through a portal, so wait for it to appear.
      expect(await screen.findByText('panel body')).toBeInTheDocument();
    });
  });
});

describe('CoverArtView release without a public credit', () => {
  it('describes the cover by the release title alone', () => {
    render(
      <MediaPlayer.CoverArtView
        artistRelease={{ release: { title: 'My Album', coverArt: 'c.jpg', digitalFormats: [] } }}
      />
    );

    expect(screen.getByRole('img')).toHaveAttribute('alt', 'My Album');
  });
});

describe('InfoTickerTape release without a public credit', () => {
  it('renders the track and release with no byline', () => {
    render(
      <MediaPlayer.InfoTickerTape
        artistRelease={{ release: { title: 'My Album', coverArt: '', digitalFormats: [] } }}
        trackName="Night Drive"
      />
    );

    expect(screen.getByText('Night Drive • My Album')).toBeInTheDocument();
  });
});

describe('InfoTickerTape minimal variant', () => {
  it('renders the track title with the artist name', () => {
    render(<MediaPlayer.InfoTickerTape trackTitle="Night Drive" artistName="Ceschi" />);

    expect(screen.getByText('Night Drive • by Ceschi')).toBeInTheDocument();
  });

  it('renders the title alone when artistName is null', () => {
    render(<MediaPlayer.InfoTickerTape trackTitle="Night Drive" artistName={null} />);

    expect(screen.getByText('Night Drive')).toBeInTheDocument();
  });
});
