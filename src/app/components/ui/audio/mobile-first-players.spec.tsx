// Mock video.js - must be before imports
import React from 'react';

import { render, screen, fireEvent } from '@testing-library/react';

import { MobileCardPlayer } from './mobile-first-players';

vi.mock('video.js', () => {
  const mockPlayer = {
    ready: vi.fn((cb: () => void) => cb()),
    addClass: vi.fn(),
    dispose: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    currentTime: vi.fn(),
    duration: vi.fn(),
    src: vi.fn(),
  };

  const videojs = vi.fn(() => mockPlayer);

  // Mock getComponent and registerComponent
  videojs.getComponent = vi.fn(
    () =>
      class MockButton {
        player() {
          return mockPlayer;
        }
      }
  );
  videojs.registerComponent = vi.fn();

  return {
    default: videojs,
    __esModule: true,
  };
});

// Mock next/image
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    width,
    height,
    ...props
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img data-testid="album-art" src={src} alt={alt} width={width} height={height} {...props} />
  ),
}));

// Mock the UI carousel components used by featured-artist-thumb-carousel
vi.mock('src/app/components/ui/carousel', () => ({
  Carousel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CarouselContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CarouselItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CarouselNext: () => <button>Next</button>,
  CarouselPrevious: () => <button>Previous</button>,
}));

// Mock the featured artists carousel
vi.mock('./featured-artist-thumb-carousel', () => ({
  FeaturedArtistsThumbCarousel: ({
    onSelect,
    artists,
  }: {
    onSelect: (artist: Artist) => void;
    artists: Artist[];
  }) => (
    <div data-testid="carousel">
      {artists.map((artist: Artist) => (
        <button
          key={artist.id}
          data-testid={`artist-${artist.id}`}
          onClick={() => onSelect(artist)}
        >
          {artist.displayName}
        </button>
      ))}
    </div>
  ),
}));

// Mock audio-controls
vi.mock('./audio-controls', () => ({
  AudioRewindButton: class MockButton {},
  AudioFastForwardButton: class MockButton {},
  SkipPreviousButton: class MockButton {},
  SkipNextButton: class MockButton {},
}));

// Mock CSS imports
vi.mock('video.js/dist/video-js.css', () => ({}));
vi.mock('./videojs-audio.css', () => ({}));

describe('MobileCardPlayer', () => {
  const defaultProps = {
    audioSrc: '/audio/initial-track.mp3',
    albumArt: '/images/initial-album.jpg',
    songTitle: 'Initial Song',
    artist: 'Initial Artist',
    album: 'Initial Album',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with initial props', () => {
    render(<MobileCardPlayer {...defaultProps} />);

    expect(screen.getByText('Initial Song')).toBeInTheDocument();
    expect(screen.getByText('From Initial Album')).toBeInTheDocument();
    expect(screen.getByText('by Initial Artist')).toBeInTheDocument();
  });

  it('renders album art with initial props', () => {
    render(<MobileCardPlayer {...defaultProps} />);

    const albumArt = screen.getByTestId('album-art');
    expect(albumArt).toHaveAttribute('src', '/images/initial-album.jpg');
    expect(albumArt).toHaveAttribute('alt', 'Initial Album by Initial Artist');
  });

  it('renders the featured artists carousel', () => {
    render(<MobileCardPlayer {...defaultProps} />);

    expect(screen.getByTestId('carousel')).toBeInTheDocument();
  });

  it('updates track info when an artist is selected from carousel', () => {
    render(<MobileCardPlayer {...defaultProps} />);

    // Click on artist 1 (Ceschi - Thank Plath)
    const artistButton = screen.getByTestId('artist-1');
    fireEvent.click(artistButton);

    // Verify the track info is updated
    expect(screen.getByText('Thank Plath')).toBeInTheDocument();
    expect(screen.getByText('From Thank Plath')).toBeInTheDocument();
    expect(screen.getByText('by Ceschi')).toBeInTheDocument();

    // Verify the album art is updated
    const albumArt = screen.getByTestId('album-art');
    expect(albumArt).toHaveAttribute('src', '/media/ceschi/thank-plath.jpg');
  });

  it('updates to Factor Chandelier when artist 5 is selected', () => {
    render(<MobileCardPlayer {...defaultProps} />);

    // Click on artist 5 (Factor Chandelier)
    const artistButton = screen.getByTestId('artist-5');
    fireEvent.click(artistButton);

    // Verify the track info is updated
    expect(screen.getByText('As Dark As Today')).toBeInTheDocument();
    expect(screen.getByText('by Factor Chandelier')).toBeInTheDocument();

    // Verify the album art is updated
    const albumArt = screen.getByTestId('album-art');
    expect(albumArt).toHaveAttribute('src', '/media/factor-chandelier/as-dark-as-today.jpg');
  });

  it('selects the most recent release when artist has multiple releases', () => {
    render(<MobileCardPlayer {...defaultProps} />);

    // Click on artist 1 (Ceschi - has a release from 2025-07-24)
    const artistButton = screen.getByTestId('artist-1');
    fireEvent.click(artistButton);

    // Verify the track is from the most recent release
    expect(screen.getByText('Thank Plath')).toBeInTheDocument();
  });

  it('renders audio element', () => {
    render(<MobileCardPlayer {...defaultProps} />);

    const audioElement = document.querySelector('audio');
    expect(audioElement).toBeInTheDocument();
  });

  it('passes optional callbacks without errors', () => {
    const onPreviousTrack = vi.fn();
    const onNextTrack = vi.fn();

    render(
      <MobileCardPlayer
        {...defaultProps}
        onPreviousTrack={onPreviousTrack}
        onNextTrack={onNextTrack}
      />
    );

    expect(screen.getByTestId('carousel')).toBeInTheDocument();
  });
});
