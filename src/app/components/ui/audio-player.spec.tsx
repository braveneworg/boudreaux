/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor } from '@testing-library/react';

import { AudioPlayer } from './audio-player';

const { mockPlayer } = vi.hoisted(() => {
  const player = {
    ready: vi.fn((cb: () => void) => cb()),
    on: vi.fn(),
    off: vi.fn(),
    one: vi.fn(),
    dispose: vi.fn(),
    src: vi.fn(),
    load: vi.fn(),
    play: vi.fn().mockReturnValue(Promise.resolve()),
    pause: vi.fn(),
    paused: vi.fn().mockReturnValue(true),
    currentTime: vi.fn().mockReturnValue(0),
    duration: vi.fn().mockReturnValue(0),
    addClass: vi.fn(),
    removeClass: vi.fn(),
    hasClass: vi.fn(),
    userActive: vi.fn(),
    isDisposed: vi.fn().mockReturnValue(false),
    // Avoid document.createElement in hoisted scope — use a lazy fn instead
    el: vi.fn(() => document.createElement('div')),
  };
  return { mockPlayer: player };
});

// Mock audio-controls to prevent it from calling real videojs.getComponent
vi.mock('@/app/components/ui/audio/audio-controls', () => ({
  resetClasses: vi.fn(),
  ensureClasses: vi.fn(),
  getAudioRewindButton: vi.fn(() => class MockRewind {}),
  getAudioFastForwardButton: vi.fn(() => class MockFastForward {}),
  getSkipPreviousButton: vi.fn(() => class MockSkipPrevious {}),
  getSkipNextButton: vi.fn(() => class MockSkipNext {}),
}));

// Mock video.js
vi.mock('video.js', () => {
  const components: Record<string, unknown> = {
    Button: class MockButton {},
  };
  const videojs = Object.assign(
    vi.fn(() => mockPlayer),
    {
      getComponent: vi.fn((name: string) => components[name] ?? null),
      registerComponent: vi.fn((name: string, comp: unknown) => {
        components[name] = comp;
      }),
    }
  );
  return { default: videojs };
});

// Mock CSS imports
vi.mock('video.js/dist/video-js.css', () => ({}));

// Mock next/image
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...props} />
  ),
}));

describe('AudioPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlayer.isDisposed.mockReturnValue(false);
    mockPlayer.ready.mockImplementation((cb: () => void) => cb());
  });

  it('renders the player container', () => {
    render(<AudioPlayer src="/audio/track.mp3" />);

    expect(document.querySelector('[data-vjs-player]')).toBeInTheDocument();
  });

  it('renders with default audio type', () => {
    render(<AudioPlayer src="/audio/track.mp3" />);

    expect(mockPlayer.src).toHaveBeenCalledWith({
      src: '/audio/track.mp3',
      type: 'audio/mpeg',
    });
  });

  it('renders with custom audio type', () => {
    render(<AudioPlayer src="/audio/track.ogg" type="audio/ogg" />);

    expect(mockPlayer.src).toHaveBeenCalledWith({
      src: '/audio/track.ogg',
      type: 'audio/ogg',
    });
  });

  it('renders poster image when provided', () => {
    render(<AudioPlayer src="/audio/track.mp3" poster="/images/album.jpg" />);

    const posterImage = screen.getByAltText('Album cover');
    expect(posterImage).toBeInTheDocument();
    expect(posterImage).toHaveAttribute('src', '/images/album.jpg');
  });

  it('does not render poster image when not provided', () => {
    render(<AudioPlayer src="/audio/track.mp3" />);

    expect(screen.queryByAltText('Album cover')).not.toBeInTheDocument();
  });

  it('calls onReady callback when player is ready', () => {
    const mockOnReady = vi.fn();

    render(<AudioPlayer src="/audio/track.mp3" onReady={mockOnReady} />);

    expect(mockPlayer.ready).toHaveBeenCalled();
    expect(mockOnReady).toHaveBeenCalledWith(mockPlayer);
  });

  it('does not call onReady when not provided', () => {
    render(<AudioPlayer src="/audio/track.mp3" />);

    expect(mockPlayer.ready).toHaveBeenCalled();
  });

  it('has responsive player container classes', () => {
    render(<AudioPlayer src="/audio/track.mp3" />);

    const container = document.querySelector('[data-vjs-player]');
    expect(container?.className).toMatch(/audio-player-wrapper/);
  });

  it('renders poster container with correct classes', () => {
    render(<AudioPlayer src="/audio/track.mp3" poster="/images/album.jpg" />);

    const posterContainer = screen.getByAltText('Album cover').parentElement;
    expect(posterContainer).toHaveClass('overflow-hidden');
    expect(posterContainer).toHaveClass('shadow-lg');
  });

  it('disposes player on unmount', async () => {
    const { unmount } = render(<AudioPlayer src="/audio/track.mp3" />);

    unmount();

    await waitFor(() => {
      expect(mockPlayer.dispose).toHaveBeenCalled();
    });
  });

  it('does not dispose already disposed player', async () => {
    mockPlayer.isDisposed.mockReturnValue(true);

    const { unmount } = render(<AudioPlayer src="/audio/track.mp3" />);

    unmount();

    await waitFor(() => {
      expect(mockPlayer.dispose).not.toHaveBeenCalled();
    });
  });
});
